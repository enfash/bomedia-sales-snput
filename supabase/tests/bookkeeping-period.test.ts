import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

type Period = { configured: boolean; starts_on?: string; state?: string; closed_through?: string | null; today: string; closable?: string[] };
let db: PGlite, owner: string;
const read = async () => (await db.query<{ r: Period }>('select bomedia.api_bookkeeping_period() as r')).rows[0].r;
const close = async (requestId: string, through: unknown, actor = owner) =>
  (await db.query<{ r: { closed_through: string } }>('select bomedia.api_close_books($1,$2::jsonb) as r', [requestId, JSON.stringify({ actor_id: actor, through })])).rows[0].r;
const monthEnds = async (starts: string, closed: string | null, today: string) =>
  (await db.query<{ d: string[] }>('select bomedia.closable_month_ends($1::date,$2::date,$3::date)::text[] as d', [starts, closed, today])).rows[0].d;
async function failure(work: () => Promise<unknown>, match: object) {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject(match); await db.exec('rollback to savepoint rejected');
}
beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
});
afterEach(async () => { await db.exec('rollback'); });

it('offers only whole, finished months that are not closed yet', async () => {
  expect(await monthEnds('2026-10-01', null, '2026-10-11')).toEqual([]);
  expect(await monthEnds('2026-10-01', null, '2026-10-31')).toEqual([]);
  expect(await monthEnds('2026-10-01', null, '2026-11-01')).toEqual(['2026-10-31']);
  expect(await monthEnds('2026-10-01', '2026-10-31', '2026-12-01')).toEqual(['2026-11-30']);
  expect(await monthEnds('2026-10-15', null, '2027-02-02')).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31']);
  expect(await monthEnds('2024-02-10', null, '2024-04-01')).toEqual(['2024-02-29', '2024-03-31']);
});

it('says the books are not configured when there is no settings row', async () => {
  expect(await read()).toMatchObject({ configured: false });
});

it('reads the period, newest closable month first', async () => {
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-01-15','active')");
  const period = await read();
  expect(period).toMatchObject({ configured: true, starts_on: '2026-01-15', state: 'active', closed_through: null });
  expect(period.closable![0] > period.closable![period.closable!.length - 1]).toBe(true);
  expect(period.closable).toContain('2026-01-31');
  expect(period.closable!.every(date => date < period.today)).toBe(true);
});

it('closes through a finished month-end, once, and replays the same request without a second audit entry', async () => {
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-01-15','active')");
  expect(await close('req-1', '2026-03-31')).toEqual({ closed_through: '2026-03-31' });
  expect(await close('req-1', '2026-03-31')).toEqual({ closed_through: '2026-03-31' });
  expect((await read()).closed_through).toBe('2026-03-31');
  expect((await read()).closable).not.toContain('2026-03-31');
  const audit = await db.query<{ details: Record<string, unknown>; actor_id: string }>("select details, actor_id from bomedia.audit_events where action='books_closed'");
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0]).toMatchObject({ details: { to: '2026-03-31' }, actor_id: owner });
  expect((await db.query<{ c: string }>("select bomedia.audit_category('books_closed') as c")).rows[0].c).toBe('settings');
});

it('refuses anything that is not a finished, unclosed month-end', async () => {
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-01-15','active')");
  await close('first', '2026-03-31');
  for (const [id, through] of [['mid', '2026-04-15'], ['future', '2099-12-31'], ['today', (await read()).today], ['older', '2026-02-28'],
    ['again', '2026-03-31'], ['before-start', '2025-12-31'], ['text', 'yesterday'], ['number', 20260430], ['missing', undefined]] as const) {
    await failure(() => close(id, through), { code: '22023' });
  }
  expect((await read()).closed_through).toBe('2026-03-31');
});

it('needs active books, an enabled staff member and no extra fields', async () => {
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on) values ('2026-01-15')");
  await failure(() => close('setup', '2026-01-31'), { code: '23514' });
  await db.exec("update bomedia.bookkeeping_settings set state='active'");
  await db.exec("update bomedia.staff set disabled_at=now() where id=$$" + owner + "$$::uuid");
  await failure(() => close('disabled', '2026-01-31'), { code: '42501' });
  await db.exec("update bomedia.staff set disabled_at=null");
  await failure(() => db.query("select bomedia.api_close_books('x',$1::jsonb)", [JSON.stringify({ actor_id: owner, through: '2026-01-31', extra: 1 })]), { code: '22023' });
});

it('can never be undone by anything, even after closing', async () => {
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-01-15','active')");
  await close('c', '2026-02-28');
  await failure(() => db.exec('update bomedia.bookkeeping_settings set closed_through = null'), { message: expect.stringContaining('cannot be reopened') });
  await failure(() => db.exec("update bomedia.bookkeeping_settings set closed_through = '2026-01-31'"), { message: expect.stringContaining('cannot be reopened') });
});

it('runs for the accounting runtime only', async () => {
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-01-15','active')");
  await db.exec('set local role bomedia_financial_runtime');
  expect((await read()).configured).toBe(true);
  expect(await close('as-runtime', '2026-01-31')).toEqual({ closed_through: '2026-01-31' });
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated', 'service_role', 'bomedia_auth_runtime']) {
    const result = await db.query<{ ok: boolean }>(`select has_function_privilege($1,'bomedia.api_bookkeeping_period()','EXECUTE')
      or has_function_privilege($1,'bomedia.api_close_books(text,jsonb)','EXECUTE') as ok`, [role]);
    expect(result.rows[0].ok).toBe(false);
  }
});
