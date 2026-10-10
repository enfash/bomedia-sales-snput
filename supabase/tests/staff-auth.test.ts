import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { insertId, testDatabase } from './helpers';
import { createPostgresAuth } from '../../lib/server/postgres-auth';
import type { AuthCall, AuthMethod } from '../../lib/server/auth-db';
import { hashPin } from '../../lib/server/pin-credentials.mjs';

let db: PGlite;
let staff: string;
let pinHash: string;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const call: AuthCall = async <T>(method: AuthMethod, parameters: (string | boolean | null)[]): Promise<T> =>
  (await db.query<{ result: T }>(`select bomedia.${method}(${parameters.map((_,i)=>`$${i+1}`).join(',')}) as result`, parameters)).rows[0].result;
beforeAll(async () => { db = await testDatabase(); pinHash = await hashPin('0042'); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  staff = await insertId(db, 'insert into bomedia.staff(display_name,login_name,pin_hash) values ($1,$2,$3) returning id', ['Staff One','staff one',pinHash]);
});
afterEach(async () => { await db.exec('rollback'); });
async function reserve(name = 'Staff One') { return call<{ status: string; ticket: string; pin_hash: string }>('auth_reserve_login', [name]); }
async function login(token: string) {
  const reserved = await reserve();
  return call<{ status: string; staff_id: string }>('auth_claim_session', [reserved.ticket,pinHash,hash(token)]);
}
async function failure(work: () => Promise<unknown>) {
  await db.exec('savepoint denied');
  await expect(work()).rejects.toMatchObject({ code: '42501' });
  await db.exec('rollback to savepoint denied');
}

it('stores only hashed session tokens and validates logout/revocation on the next request', async () => {
  expect(await login('private-session-token')).toMatchObject({ status: 'ok',staff_id: staff });
  expect(await call('auth_read_session',[hash('private-session-token')])).toMatchObject({ staff_id: staff });
  const rows = await db.query<{ token_hash: string }>('select token_hash from bomedia.sessions');
  expect(rows.rows).toEqual([{ token_hash: hash('private-session-token') }]);
  await call('auth_revoke_session',[hash('private-session-token')]);
  expect(await call('auth_read_session',[hash('private-session-token')])).toBeNull();
});

it('respects one active session when enabled and allows concurrent sessions when disabled', async () => {
  await login('a'); await login('b');
  expect(await call('auth_read_session',[hash('a')])).not.toBeNull();
  await db.exec('update bomedia.access_settings set single_session=true');
  expect(await call('auth_read_session',[hash('a')])).toBeNull();
  expect(await call('auth_read_session',[hash('b')])).not.toBeNull();
  await login('c');
  expect(await call('auth_read_session',[hash('b')])).toBeNull();
  expect(await call('auth_read_session',[hash('c')])).not.toBeNull();
});

it('reserves at most five verifications per account even before any PIN check completes', async () => {
  for (let i=0;i<5;i++) expect((await reserve()).status).toBe('ready');
  expect((await reserve()).status).toBe('limited');
  expect((await db.query('select ticket_hash from bomedia.auth_login_tickets')).rows).toHaveLength(5);
  await db.exec("update bomedia.login_attempts set window_started_at=clock_timestamp()-interval '16 minutes'");
  expect((await reserve()).status).toBe('ready');
});

it('bounds unknown-name state and does not disclose a PIN through the staff list', async () => {
  for (let i=0;i<20;i++) await reserve(`unknown-${i}`);
  expect((await db.query('select key_hash from bomedia.login_attempts')).rows).toHaveLength(1);
  const list = await call<Record<string, unknown>[]>('auth_list_staff',[]);
  expect(list[0]).toMatchObject({ Name: 'Staff One', HasPasscode: true, RequiresPinReset: false });
  expect(JSON.stringify(list)).not.toContain(pinHash);
  expect(list[0]).not.toHaveProperty('Passcode');
});

it('refuses ticket replay, expired tickets, missing PINs and credential reset during verification', async () => {
  let reserved = await reserve();
  expect(await call('auth_claim_session',[reserved.ticket,pinHash,hash('first')])).toMatchObject({ status: 'ok' });
  expect(await call('auth_claim_session',[reserved.ticket,pinHash,hash('replay')])).toMatchObject({ status: 'invalid' });
  reserved = await reserve();
  await db.exec("update bomedia.auth_login_tickets set expires_at=clock_timestamp()-interval '1 second'");
  expect(await call('auth_claim_session',[reserved.ticket,pinHash,hash('expired')])).toMatchObject({ status: 'invalid' });
  reserved = await reserve();
  await call('auth_manage_staff',['reset','Staff One',pinHash,'owner@example.test']);
  expect(await call('auth_claim_session',[reserved.ticket,pinHash,hash('reset')])).toMatchObject({ status: 'invalid' });
  await db.query('update bomedia.staff set pin_hash=null where id=$1',[staff]);
  expect((await call<Record<string,unknown>[]>('auth_list_staff',[]))[0].RequiresPinReset).toBe(true);
  reserved = await reserve();
  expect(await call('auth_claim_session',[reserved.ticket,pinHash,hash('blank')])).toMatchObject({ status: 'invalid' });
});

it('revokes existing sessions on PIN reset, disabling and policy revision', async () => {
  await login('original');
  await call('auth_manage_staff',['reset','Staff One',pinHash,'owner@example.test']);
  expect(await call('auth_read_session',[hash('original')])).toBeNull();
  await login('after-reset');
  await db.exec('update bomedia.access_settings set policy_revision=policy_revision+1');
  expect(await call('auth_read_session',[hash('after-reset')])).toBeNull();
  await login('after-policy');
  await call('auth_manage_staff',['disable','Staff One',null,'owner@example.test']);
  expect(await call('auth_read_session',[hash('after-policy')])).toBeNull();
  expect(await call('auth_list_staff',[])).toEqual([]);
});

it('does not mistake a browser presence change for logout', async () => {
  await login('current');
  expect(await call('auth_presence',[hash('current'),false])).toBe(true);
  expect((await call<Record<string,unknown>[]>('auth_list_staff',[]))[0].Status).toBe('Offline');
  expect(await call('auth_read_session',[hash('current')])).not.toBeNull();
  await call('auth_presence',[hash('current'),true]);
  expect((await call<Record<string,unknown>[]>('auth_list_staff',[]))[0].Status).toBe('Online');
});

it('fails closed for required work-device verification without pretending a browser proves device identity', async () => {
  await login('before-policy');
  await db.exec("update bomedia.access_settings set phone_scope='selected'");
  await db.query('insert into bomedia.phone_required_staff(staff_id) values ($1)',[staff]);
  expect(await call('auth_read_session',[hash('before-policy')])).toBeNull();
  expect(await login('unsupported-device')).toMatchObject({ status: 'device_required' });
});

it('permits only scoped auth functions through the runtime role, never staff hashes, financial data or generic journals', async () => {
  await db.exec('set local role bomedia_auth_runtime');
  expect((await call<Record<string,unknown>[]>('auth_list_staff',[]))[0].Name).toBe('Staff One');
  expect((await reserve()).status).toBe('ready');
  await failure(() => db.query('select pin_hash from bomedia.staff'));
  await failure(() => db.query('select * from bomedia.payments'));
  await failure(() => db.query("select bomedia.post_journal('forged','{}')"));
  await failure(() => db.query("select bomedia.record_payment('forged','{}')"));
  await failure(() => db.query('update bomedia.access_settings set single_session=false'));
});

it.each(['anon','authenticated','service_role'])('does not grant authentication capabilities to %s', async role => {
  const result = await db.query<{ permitted: boolean }>("select has_function_privilege($1,'bomedia.auth_list_staff()','EXECUTE') as permitted",[role]);
  expect(result.rows[0].permitted).toBe(false);
});

it('exercises the Node PIN verifier, signed cookie, database session and own-account heartbeat end to end', async () => {
  const service = createPostgresAuth(call);
  await expect(service.login('Staff One','wrong')).rejects.toMatchObject({ status: 401 });
  const result = await service.login(' staff   ONE ','0042');
  expect(result.name).toBe('Staff One');
  expect(result).not.toHaveProperty('pin_hash');
  expect(await service.session(result.token)).toMatchObject({ staff_id: staff });
  await expect(service.presence(result.token,'Someone Else',true)).rejects.toMatchObject({ status: 403 });
  await service.presence(result.token,'Staff One',true);
  await service.logout(result.token);
  expect(await service.session(result.token)).toBeNull();
});
