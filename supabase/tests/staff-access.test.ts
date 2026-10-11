import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { insertId, testDatabase } from './helpers';
import type { AuthCall, AuthMethod } from '../../lib/server/auth-db';
import { hashPin } from '../../lib/server/pin-credentials.mjs';

let db: PGlite;
let staff: string;
let pinHash: string;
const admin = 'owner@example.test';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const call: AuthCall = async <T>(method: AuthMethod, parameters: (string | boolean | null)[]): Promise<T> =>
  (await db.query<{ result: T }>(`select bomedia.${method}(${parameters.map((_, i) => `$${i + 1}`).join(',')}) as result`, parameters)).rows[0].result;
type Overview = { single_session: boolean; staff: Record<string, unknown>[]; removed: Record<string, unknown>[] };
const overview = () => call<Overview>('auth_staff_overview', []);
async function login(token: string, name = 'Staff One', hashValue = pinHash) {
  const reserved = await call<{ ticket: string }>('auth_reserve_login', [name]);
  return call<{ status: string }>('auth_claim_session', [reserved.ticket, hashValue, hash(token)]);
}
async function denied(work: () => Promise<unknown>, code: string) {
  await db.exec('savepoint refused');
  await expect(work()).rejects.toMatchObject({ code });
  await db.exec('rollback to savepoint refused');
}
beforeAll(async () => { db = await testDatabase(); pinHash = await hashPin('0042'); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  staff = await insertId(db, 'insert into bomedia.staff(display_name,login_name,pin_hash) values ($1,$2,$3) returning id', ['Staff One', 'staff one', pinHash]);
});
afterEach(async () => { await db.exec('rollback'); });

it('lists live devices per cashier and lists removed staff separately', async () => {
  await login('a'); await login('b');
  await call('auth_manage_staff', ['create', 'Bisi', pinHash, admin]);
  await call('auth_manage_staff', ['disable', 'Bisi', null, admin]);
  const result = await overview();
  expect(result.single_session).toBe(false);
  expect(result.staff).toHaveLength(1);
  expect(result.staff[0]).toMatchObject({ Name: 'Staff One', Devices: 2, HasPasscode: true });
  expect(JSON.stringify(result)).not.toContain(pinHash);
  expect(result.removed).toEqual([expect.objectContaining({ Name: 'Bisi' })]);
});

it('signs a cashier out of every device but keeps their PIN and account', async () => {
  await login('a'); await login('b');
  expect(await call('auth_sign_out_staff', ['Staff One', admin])).toBe(2);
  expect(await call('auth_read_session', [hash('a')])).toBeNull();
  expect(await call('auth_read_session', [hash('b')])).toBeNull();
  expect((await overview()).staff[0]).toMatchObject({ Devices: 0, Status: 'Offline' });
  expect(await login('c')).toMatchObject({ status: 'ok' });
  const audit = await db.query("select details from bomedia.audit_events where action='staff_sign_out'");
  expect(audit.rows[0]).toMatchObject({ details: { admin_identity: admin, sessions: 2 } });
});

it('records which cashier an admin action was about, and never the PIN', async () => {
  await call('auth_manage_staff', ['reset', ' staff   ONE ', pinHash, admin]);
  await call('auth_sign_out_staff', ['staff one', admin]);
  await call('auth_manage_staff', ['disable', 'Staff One', null, admin]);
  await call('auth_manage_staff', ['restore', 'Staff One', pinHash, admin]);
  const rows = await db.query<{ action: string; details: Record<string, unknown> }>(
    "select action, details from bomedia.audit_events where action in ('staff_reset','staff_sign_out','staff_disable','staff_restore')");
  expect(rows.rows).toHaveLength(4);
  for (const row of rows.rows) expect(row.details).toMatchObject({ name: 'Staff One', admin_identity: admin });
  expect(JSON.stringify(rows.rows)).not.toContain(pinHash);
});

it('refuses to sign out unknown or removed staff', async () => {
  await denied(() => call('auth_sign_out_staff', ['Nobody', admin]), '22023');
  await call('auth_manage_staff', ['disable', 'Staff One', null, admin]);
  await denied(() => call('auth_sign_out_staff', ['Staff One', admin]), '22023');
  await denied(() => call('auth_sign_out_staff', ['Staff One', ' ']), '22023');
});

it('restores a removed cashier only with a fresh PIN, and the old PIN and sessions stay dead', async () => {
  const fresh = await hashPin('7391');
  await login('before');
  await call('auth_manage_staff', ['disable', 'Staff One', null, admin]);
  await denied(() => call('auth_manage_staff', ['restore', 'Staff One', null, admin]), '22023');
  expect(await call<string>('auth_manage_staff', ['restore', 'Staff One', fresh, admin])).toBe(staff);
  expect(await call('auth_read_session', [hash('before')])).toBeNull();
  expect(await login('old-pin', 'Staff One', pinHash)).toMatchObject({ status: 'invalid' });
  expect(await login('new-pin', 'Staff One', fresh)).toMatchObject({ status: 'ok' });
  const result = await overview();
  expect(result.removed).toEqual([]);
  expect(result.staff.map(person => person.Name)).toEqual(['Staff One']);
  expect((await db.query("select 1 from bomedia.audit_events where action='staff_restore'")).rows).toHaveLength(1);
});

it('refuses to restore an account that is active or missing, and keeps names unique', async () => {
  await denied(() => call('auth_manage_staff', ['restore', 'Staff One', pinHash, admin]), '22023');
  await denied(() => call('auth_manage_staff', ['restore', 'Nobody', pinHash, admin]), '22023');
  await call('auth_manage_staff', ['disable', 'Staff One', null, admin]);
  await denied(() => call('auth_manage_staff', ['create', 'Staff One', pinHash, admin]), '23505');
});

it('turns the one-device rule on and off, trimming extra devices and leaving the newest', async () => {
  await login('a'); await login('b'); await login('c');
  expect(await call('auth_set_single_session', [true, admin])).toBe(true);
  expect((await overview())).toMatchObject({ single_session: true });
  expect(await call('auth_read_session', [hash('c')])).not.toBeNull();
  expect(await call('auth_read_session', [hash('a')])).toBeNull();
  expect(await call('auth_read_session', [hash('b')])).toBeNull();
  expect((await overview()).staff[0]).toMatchObject({ Devices: 1 });
  expect(await call('auth_set_single_session', [false, admin])).toBe(false);
  await login('d');
  expect(await call('auth_read_session', [hash('c')])).not.toBeNull();
  expect(await call('auth_read_session', [hash('d')])).not.toBeNull();
});

it('does not sign out other cashiers, bump the policy revision or double-log an unchanged setting', async () => {
  await call('auth_manage_staff', ['create', 'Other', pinHash, admin]);
  await login('mine'); await login('theirs', 'Other');
  const before = await db.query('select policy_revision from bomedia.access_settings');
  await call('auth_set_single_session', [true, admin]);
  await call('auth_set_single_session', [true, admin]);
  expect(await call('auth_read_session', [hash('mine')])).not.toBeNull();
  expect(await call('auth_read_session', [hash('theirs')])).not.toBeNull();
  expect((await db.query('select policy_revision from bomedia.access_settings')).rows).toEqual(before.rows);
  expect((await db.query("select 1 from bomedia.audit_events where action='staff_single_session'")).rows).toHaveLength(1);
  await denied(() => call('auth_set_single_session', [null, admin]), '22023');
  await denied(() => call('auth_set_single_session', [true, '']), '22023');
});

it('runs the new functions through the sign-in role without table access', async () => {
  await db.exec('set local role bomedia_auth_runtime');
  expect((await overview()).staff[0].Name).toBe('Staff One');
  expect(await call('auth_sign_out_staff', ['Staff One', admin])).toBe(0);
  await denied(() => db.query('select * from bomedia.sessions'), '42501');
  await db.exec('reset role');
});

it.each(['anon', 'authenticated', 'service_role'])('does not grant the new capabilities to %s', async role => {
  const result = await db.query<{ ok: boolean }>(`select has_function_privilege($1,'bomedia.auth_staff_overview()','EXECUTE')
    or has_function_privilege($1,'bomedia.auth_sign_out_staff(text,text)','EXECUTE')
    or has_function_privilege($1,'bomedia.auth_set_single_session(boolean,text)','EXECUTE') as ok`, [role]);
  expect(result.rows[0].ok).toBe(false);
});
