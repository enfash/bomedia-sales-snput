// Hosted authentication smoke test. All synthetic business changes roll back.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { testConnection } from './cli.mjs';
import { hashPin, verifyPin } from '../../lib/server/pin-credentials.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
let owner, runtime;
let phase = 'configuration';
try {
  const [flag, ref, ...extra] = process.argv.slice(2);
  assert.equal(flag, '--confirm-project'); assert.equal(extra.length, 0);
  const ownerUrl = new URL(testConnection(process.env.SUPABASE_MIGRATION_DATABASE_URL, process.env.SUPABASE_MIGRATION_PROJECT_REF, ref));
  const runtimeUrl = new URL(process.env.SUPABASE_AUTH_DATABASE_URL);
  assert.equal(runtimeUrl.hostname, ownerUrl.hostname);
  assert.equal(decodeURIComponent(runtimeUrl.username), ownerUrl.hostname.endsWith('.pooler.supabase.com') ? `bomedia_auth_server.${ref}` : 'bomedia_auth_server');
  assert.equal(runtimeUrl.pathname, '/postgres'); assert.equal(runtimeUrl.search, ''); assert.equal(runtimeUrl.hash, '');
  const ssl = { rejectUnauthorized: true, ca: await readFile(process.env.SUPABASE_CA_CERT_PATH, 'utf8') };
  const options = { ssl, max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} };
  owner = postgres(ownerUrl.toString(), options); runtime = postgres(runtimeUrl.toString(), options);
  phase = 'role-and-schema';
  const [role] = await runtime`select current_user as name, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname=current_user`;
  assert.equal(role.name, 'bomedia_auth_server');
  for (const key of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole']) assert.equal(role[key], false);
  const tables = await owner`select c.oid,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('bomedia','migration','migration_control') and c.relkind='r'`;
  assert(tables.every(t => t.relrowsecurity));
  const [excess] = await owner`select exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('bomedia','migration','migration_control') and c.relkind in ('r','v','S')
    and has_table_privilege('bomedia_auth_server',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as tables,
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('bomedia','migration','migration_control')
      and has_function_privilege('bomedia_auth_server',p.oid,'EXECUTE') and p.proname not in
      ('auth_reserve_login','auth_claim_session','auth_read_session','auth_revoke_session','auth_presence','auth_list_staff','auth_manage_staff')) as functions`;
  assert.equal(excess.tables, false); assert.equal(excess.functions, false);
  for (const apiRole of ['anon','authenticated','service_role']) {
    const [access] = await owner`select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('bomedia','migration','migration_control') and has_function_privilege(${apiRole},p.oid,'EXECUTE')) as granted`;
    assert.equal(access.granted, false);
  }
  const migrations = await owner`select name,checksum from migration_control.applied_migrations order by name`;
  const files = (await readdir(`${root}supabase/migrations`)).filter(f => f.endsWith('.sql')).sort();
  assert.deepEqual(migrations.map(m => m.name), files);
  for (const file of migrations) assert.equal(file.checksum, hash(await readFile(`${root}supabase/migrations/${file.name}`, 'utf8')));
  const counts = async () => (await owner`select (select count(*)::int from bomedia.staff) as staff,
    (select count(*)::int from bomedia.sessions) as sessions, (select count(*)::int from bomedia.login_attempts) as attempts,
    (select count(*)::int from bomedia.auth_login_tickets) as tickets, (select count(*)::int from bomedia.audit_events) as audit,
    (select staff_revision::text from bomedia.access_settings where singleton) as staff_revision,
    (select count(*)::int from bomedia.jobs) as jobs, (select count(*)::int from bomedia.payments) as payments,
    (select count(*)::int from bomedia.expenses) as expenses, (select count(*)::int from bomedia.journal_entries) as journals,
    (select count(*)::int from bomedia.idempotency_requests) as requests`)[0];
  const before = await counts();
  const name = `Migration smoke ${randomBytes(12).toString('hex')}`;
  const pin = randomBytes(8).toString('hex'); const encoded = await hashPin(pin);
  const rollback = new Error('Rollback synthetic authentication test');
  phase = 'authentication-transaction';
  try {
    await runtime.begin(async tx => {
      const [{id}] = await tx`select bomedia.auth_manage_staff('create',${name},${encoded},'migration-smoke-test') as id`;
      const reserve = async () => (await tx`select bomedia.auth_reserve_login(${name}) as result`)[0].result;
      const login = async token => {
        const reservation = await reserve(); assert.equal(reservation.status, 'ready');
        assert(await verifyPin(pin, reservation.pin_hash)); assert.equal(await verifyPin('incorrect',reservation.pin_hash), false);
        const [{result}] = await tx`select bomedia.auth_claim_session(${reservation.ticket},${reservation.pin_hash},${hash(token)}) as result`;
        assert.equal(result.status,'ok'); assert.equal(result.staff_id,id);
      };
      const token = randomBytes(32).toString('hex');
      await login(token);
      assert.equal((await tx`select bomedia.auth_read_session(${hash(token)}) as result`)[0].result.staff_id,id);
      assert.equal((await tx`select bomedia.auth_presence(${hash(token)},false) as result`)[0].result,true);
      assert((await tx`select bomedia.auth_read_session(${hash(token)}) as result`)[0].result);
      await tx`select bomedia.auth_manage_staff('reset',${name},${encoded},'migration-smoke-test')`;
      assert.equal((await tx`select bomedia.auth_read_session(${hash(token)}) as result`)[0].result,null);
      await login(token+'reset');
      await tx`select bomedia.auth_revoke_session(${hash(token+'reset')})`;
      assert.equal((await tx`select bomedia.auth_read_session(${hash(token+'reset')}) as result`)[0].result,null);
      await login(token+'disable');
      await tx`select bomedia.auth_manage_staff('disable',${name},null,'migration-smoke-test')`;
      assert.equal((await tx`select bomedia.auth_read_session(${hash(token+'disable')}) as result`)[0].result,null);
      for (const statement of ['select pin_hash from bomedia.staff','select * from bomedia.payments',"select bomedia.post_journal('forged','{}')"]) {
        let denied = false;
        try { await tx.savepoint(async sp => { await sp.unsafe(statement); }); } catch (error) { denied = error.code === '42501'; }
        assert(denied);
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  phase = 'rollback-verification';
  assert.deepEqual(await counts(), before);
  const listed = (await runtime`select bomedia.auth_list_staff() as result`)[0].result;
  assert(!listed.some(person => person.Name === name));
  assert(listed.every(person => !Object.hasOwn(person,'Passcode') && !Object.hasOwn(person,'pin_hash')));
  const report = { verifiedAt: new Date().toISOString(), verified: true, migrations: migrations.map(m=>m.name),
    rlsTables: tables.length, role: role.name, directPrivateAccess: false, apiFunctionAccess: false,
    sessionResetDisableLogout: 'passed', syntheticChangesRolledBack: true, counts: before, backendActivated: false };
  await writeFile(`${root}migration-data/hosted-auth-verification-20261004.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
} catch {
  console.error(`Hosted authentication verification failed at ${phase}; no credentials or database error details logged.`);
  process.exitCode = 1;
} finally { await Promise.all([owner?.end({timeout:5}),runtime?.end({timeout:5})]); }
