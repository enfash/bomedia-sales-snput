// One-time local setup for the narrow auth runtime login. Never prints credentials.
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { testConnection } from './cli.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
// The sandbox runner points this at .env.sandbox.local; normal runs keep .env.local.
const envPath = join(root, process.env.BOMEDIA_ENV_FILE === '.env.sandbox.local' ? '.env.sandbox.local' : '.env.local');
const pendingPrefix = envPath.endsWith('.env.sandbox.local') ? 'sandbox-' : '';
const financial = process.argv.at(-1) === '--financial';
const roleName = financial ? 'bomedia_financial_server' : 'bomedia_auth_server';
const groupName = financial ? 'bomedia_financial_runtime' : 'bomedia_auth_runtime';
const variableName = financial ? 'SUPABASE_FINANCIAL_DATABASE_URL' : 'SUPABASE_AUTH_DATABASE_URL';
const pendingPath = join(root, `migration-data/${pendingPrefix}${financial ? 'financial' : 'auth'}-runtime-credential.pending.json`);
const configuredPattern = new RegExp(`^${variableName}=`, 'gm');
const allowedFunctions = financial ? ['api_collect','api_read','api_report','api_sale','api_customer','api_payment_methods','api_expense','api_expense_payment','api_expense_categories','api_expenses_awaiting','api_restock','api_waste','api_stock_count','api_quote','api_quote_lookup','api_price_requests','api_price_decision','api_services','api_service_save','api_legacy_feed','api_job_status','api_legacy_sale','api_legacy_collect'] : ['auth_reserve_login','auth_claim_session','auth_read_session','auth_revoke_session','auth_presence','auth_list_staff','auth_manage_staff'];
let sql;
try {
  const [flag, confirmedRef, ...extra] = process.argv.slice(2, financial ? -1 : undefined);
  if (flag !== '--confirm-project' || extra.length) throw new Error('Explicit project confirmation required');
  const migrationUrl = new URL(testConnection(process.env.SUPABASE_MIGRATION_DATABASE_URL,
    process.env.SUPABASE_MIGRATION_PROJECT_REF, confirmedRef));
  const originalEnv = await readFile(envPath, 'utf8');
  if ((originalEnv.match(configuredPattern) ?? []).length > 1) throw new Error('Duplicate runtime configuration');
  let pending;
  try { pending = JSON.parse(await readFile(pendingPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const configured = process.env[variableName] || pending?.url;
  const authUrl = new URL(configured || migrationUrl.toString());
  if (!configured) {
    authUrl.username = migrationUrl.hostname.endsWith('.pooler.supabase.com') ? `${roleName}.${confirmedRef}` : roleName;
    authUrl.password = randomBytes(32).toString('base64url');
  }
  if (authUrl.hostname !== migrationUrl.hostname || authUrl.pathname !== '/postgres' || authUrl.search || authUrl.hash
    || !['postgres:','postgresql:'].includes(authUrl.protocol) || !['5432','6543',''].includes(authUrl.port)
    || decodeURIComponent(authUrl.username) !== (migrationUrl.hostname.endsWith('.pooler.supabase.com') ? `${roleName}.${confirmedRef}` : roleName)
    || !authUrl.password) throw new Error('Unexpected authentication connection');
  // Persist a recovery copy before committing a role/password creation. A failed
  // run can resume without printing or rotating a credential already in use.
  if (!pending) await writeFile(pendingPath, JSON.stringify({ projectRef: confirmedRef, url: authUrl.toString() }), { mode: 0o600, flag: 'wx' });
  else if (pending.projectRef !== confirmedRef || pending.url !== authUrl.toString()) throw new Error('Pending credential differs');
  const ca = await readFile(process.env.SUPABASE_CA_CERT_PATH, 'utf8');
  sql = postgres(migrationUrl.toString(), { ssl: { rejectUnauthorized: true, ca }, max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const result = await sql.begin(async tx => {
    const [existing] = await tx`select rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolcanlogin,rolinherit from pg_roles where rolname=${roleName}`;
    if (existing && (!configured || existing.rolsuper || existing.rolbypassrls || existing.rolcreaterole || existing.rolcreatedb || !existing.rolcanlogin || !existing.rolinherit)) {
      throw new Error('Existing role needs review');
    }
    if (!existing) {
      // PostgreSQL safely quotes the identifier/password. The generated SQL is
      // used only in memory, never returned, logged or placed in a shell string.
      const [statement] = await tx`select format('create role %I login nosuperuser nocreatedb nocreaterole inherit nobypassrls password %L', ${roleName}::text, ${decodeURIComponent(authUrl.password)}::text) as ddl`;
      await tx.unsafe(statement.ddl);
    }
    const [grant] = await tx`select format('grant %I to %I', ${groupName}::text, ${roleName}::text) as ddl`;
    await tx.unsafe(grant.ddl);
    const [grants] = await tx`select exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('bomedia','migration','migration_control') and c.relkind in ('r','v')
      and has_table_privilege(${roleName},c.oid,'SELECT,INSERT,UPDATE,DELETE')) as excess`;
    const functions = await tx`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('bomedia','migration','migration_control') and has_function_privilege(${roleName},p.oid,'EXECUTE')`;
    const membership = await tx`select parent.rolname,m.admin_option from pg_auth_members m
      join pg_roles parent on parent.oid=m.roleid join pg_roles child on child.oid=m.member where child.rolname=${roleName}`;
    if (grants.excess || functions.some(f=>!allowedFunctions.includes(f.proname))
      || membership.some(m=>m.rolname!==groupName || m.admin_option)) throw new Error('Unexpected runtime privileges');
    return { created: !existing, role: roleName, directStaffAndFinancialAccess: false };
  });
  if (await readFile(envPath, 'utf8') !== originalEnv) throw new Error('Environment file changed; recovery credential preserved');
  const line = `${variableName}=${JSON.stringify(authUrl.toString())}`;
  const updated = new RegExp(`^${variableName}=`, 'm').test(originalEnv)
    ? originalEnv.replace(new RegExp(`^${variableName}=.*$`, 'm'), line) : `${originalEnv.trimEnd()}\n\n${line}\n`;
  const temp = `${envPath}.auth-${randomBytes(8).toString('hex')}`;
  await writeFile(temp, updated, { mode: 0o600, flag: 'wx' });
  await rename(temp, envPath); await chmod(envPath, 0o600);
  await unlink(pendingPath);
  console.log(JSON.stringify({ ...result, credentialSavedPrivately: true, backendNotActivated: true }));
} catch {
  console.error('Runtime setup failed. Any pending credential remains private in migration-data; no credentials were logged.');
  process.exitCode = 1;
} finally { if (sql) await sql.end({ timeout: 5 }); }
