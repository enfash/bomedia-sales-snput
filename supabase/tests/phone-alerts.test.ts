import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

let db: PGlite, ada: string, owner: string;
const owned = async (sql: string, params: unknown[] = []) => {
  await db.exec('reset role'); const rows = (await db.query<Record<string, any>>(sql, params)).rows; await db.exec('set local role bomedia_financial_runtime'); return rows;
};
const create = async (sql: string, params: unknown[] = []) => { await db.exec('reset role'); const id = await insertId(db, sql, params); await db.exec('set local role bomedia_financial_runtime'); return id; };
const call = async (sql: string, params: unknown[]) => (await db.query<{ r: any }>(sql, params)).rows[0].r;
const phone = (who: string, n: number) => ({ actor_id: who, endpoint: `https://push.example.test/endpoint/${n}-abcdefghijklmnop`, p256dh: 'p256dh-key-abcdefghijklmnopqrstuvwxyz', auth: 'auth-secret-abcd', label: `Phone ${n}` });
const subscribe = (who: string, n: number) => call('select bomedia.api_push_subscribe($1,$2::jsonb) as r', [`sub-${who}-${n}`, JSON.stringify(phone(who, n))]);
const claim = () => call('select bomedia.api_push_claim($1,50) as r', [owner]);
const outbox = async () => owned('select kind, audience, title, body, url, sent_at from bomedia.notification_outbox order by kind, body');
const approval = (over: Record<string, unknown> = {}) => owned(
  `insert into bomedia.approval_requests(operation, request_key, payload, payload_sha256, kinds, changes, summary, reason, requested_by)
   values ($1, $2, '{}'::jsonb, 'x', $3::text[], '[]'::jsonb, $4::jsonb, 'Because', $5) returning id`,
  [over.operation ?? 'screen_order', over.key ?? `k-${Math.random()}`, over.kinds ?? '{price}', JSON.stringify(over.summary ?? { client: 'Zed Events', total_kobo: '4800000' }), ada]);

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Ada','ada') returning id");
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async () => { await db.exec('rollback'); });

it('tells the owner when a request is waiting, with who and what but no money', async () => {
  await approval();
  await approval({ operation: 'screen_expense', summary: { items: [{ paid_to: 'Ink Depot', category: 'Ink', amount_kobo: '6000000' }], total_kobo: '6000000' } });
  await approval({ operation: 'sale_correction', kinds: '{cancellation}', summary: { client: 'Grace Chapel', total_kobo: '0' } });
  await approval({ operation: 'expense_correction', kinds: '{correction}', summary: { paid_to: 'Ink Depot', category: 'Ink', total_kobo: '100' } });
  const rows = await outbox();
  expect(rows.map((r) => r.body)).toEqual(['Ada: Grace Chapel (sale cancellation)', 'Ada: Ink Depot (expense change)', 'Ada: Ink Depot (expense)', 'Ada: Zed Events (sale)']);
  expect(rows.every((r) => r.audience === 'owner' && r.title === 'Needs your approval' && r.url === '/bom03/approvals')).toBe(true);
  expect(JSON.stringify(rows)).not.toMatch(/₦|\d{4,}/);
});

it('tells the cashier the answer to their request, and only when it is decided', async () => {
  const [{ id }] = await approval();
  await owned("update bomedia.approval_requests set status='approved', decided_by=$2 where id=$1", [id, owner]);
  const [{ id: other }] = await approval({ summary: { client: 'Adeola Stores' } });
  await owned("update bomedia.approval_requests set status='declined', decided_by=$2 where id=$1", [other, owner]);
  await owned("update bomedia.approval_requests set status='pending' where id=$1", [other]);
  const rows = (await outbox()).filter((r) => r.kind === 'approval_decided');
  expect(rows.map((r) => [r.title, r.body, r.audience, r.url])).toEqual([['Declined', 'Adeola Stores (sale) was declined', 'staff', '/cashier'], ['Approved', 'Zed Events (sale) was approved', 'staff', '/cashier']]);
});

it('tells the owner about staff changes to a customer and about stock running low', async () => {
  const customer = await create("insert into bomedia.customers(display_name,contact) values ('Grace Chapel','0803') returning id");
  await owned('insert into bomedia.customer_changes(customer_id,changed_by,changes) values ($1,$2,$3::jsonb)', [customer, ada, JSON.stringify({ contact: { from: '0803', to: '0805' }, notes: { from: null, to: 'x' } })]);
  const material = await create("insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo) values ('MAT-FLEX','Flex',10,15000) returning id");
  const roll = await create("insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo,status) values ($1,'Flex 10ft',10,100,80,1000000,15000,'Active') returning id", [material]);
  await owned("update bomedia.inventory_rolls set remaining_length_ft=5, status='Low Stock' where id=$1", [roll]);
  await owned("update bomedia.inventory_rolls set remaining_length_ft=5 where id=$1", [roll]);
  const rows = await outbox();
  expect(rows.map((r) => [r.kind, r.body])).toEqual([['customer_changed', 'Ada changed the phone number and notes of Grace Chapel'], ['stock_low', 'Flex 10ft is running low']]);
  expect(rows[0].url).toMatch(/^\/bom03\/customers\?open=CUS-/);
});

it('sends an alert only to phones that are on, never to the person who caused it, and skips switched-off kinds', async () => {
  await subscribe(owner, 1); await subscribe(owner, 2); await subscribe(ada, 3);
  await approval();                                                   // owner hears (2 phones)
  const [{ id }] = await approval({ summary: { client: 'Adeola Stores' } });
  await owned("update bomedia.approval_requests set status='approved', decided_by=$2 where id=$1", [id, owner]);   // ada hears (1 phone)
  const batch = await claim();
  const byKind = (k: string) => batch.filter((b: any) => b.kind === k);
  expect(byKind('approval_waiting')).toHaveLength(2);
  expect(byKind('approval_waiting')[0].targets).toHaveLength(2);
  expect(byKind('approval_decided')[0].targets.map((t: any) => t.endpoint)).toEqual([phone(ada, 3).endpoint]);
  // The owner changing a customer does not alert the owner.
  const customer = await create("insert into bomedia.customers(display_name) values ('Solo') returning id");
  await owned('insert into bomedia.customer_changes(customer_id,changed_by,changes) values ($1,$2,$3::jsonb)', [customer, owner, JSON.stringify({ notes: { from: null, to: 'x' } })]);
  expect((await claim()).filter((b: any) => b.kind === 'customer_changed')).toHaveLength(0);
  // Switching a kind off for the owner skips it.
  await call('select bomedia.api_push_preference_save($1,$2::jsonb) as r', ['p1', JSON.stringify({ actor_id: owner, kind: 'approval_waiting', enabled: false })]);
  await approval({ summary: { client: 'Later' } });
  expect((await claim()).filter((b: any) => b.kind === 'approval_waiting')).toHaveLength(0);
});

it('marks an alert sent once reported, retries a failure, and forgets phones the push service says are gone', async () => {
  const first = await subscribe(owner, 1); await subscribe(owner, 2);
  await approval();
  const [item] = await claim();
  expect(await claim()).toHaveLength(0);                              // being sent: not handed out twice
  await call('select bomedia.api_push_report($1::jsonb) as r', [JSON.stringify([{ id: item.id, delivered: 0, error: 'timeout' }])]);
  expect((await outbox())[0].sent_at).toBeNull();
  await owned('update bomedia.notification_outbox set claimed_at = null');
  const [again] = await claim();
  expect(again.id).toBe(item.id);
  await call('select bomedia.api_push_report($1::jsonb) as r', [JSON.stringify([{ id: item.id, delivered: 1, delivered_to: [item.targets[1].id], gone: [first.id] }])]);
  expect((await outbox())[0].sent_at).not.toBeNull();
  expect(await owned('select count(*)::int as n from bomedia.push_subscriptions')).toEqual([{ n: 1 }]);
  expect(await claim()).toHaveLength(0);
});

it('lists a person’s phones, flags the one asking, and removes one on request', async () => {
  await subscribe(ada, 1); await subscribe(ada, 2); await subscribe(owner, 3);
  const state = await call('select bomedia.api_push_state($1,$2) as r', [ada, phone(ada, 2).endpoint]);
  expect(state.this_phone).toBe(true);
  expect(state.devices.map((d: any) => [d.label, d.this_phone])).toEqual([['Phone 1', false], ['Phone 2', true]]);
  await call('select bomedia.api_push_unsubscribe($1,$2::jsonb) as r', ['u1', JSON.stringify({ actor_id: ada, endpoint: phone(ada, 2).endpoint })]);
  await call('select bomedia.api_push_unsubscribe($1,$2::jsonb) as r', ['u2', JSON.stringify({ actor_id: ada, endpoint: phone(owner, 3).endpoint })]);
  expect(await owned('select count(*)::int as n from bomedia.push_subscriptions')).toEqual([{ n: 2 }]);
  const again = await call('select bomedia.api_push_state($1,$2) as r', [ada, phone(ada, 2).endpoint]);
  expect(again.this_phone).toBe(false);
});

it('moves a phone to whoever signs in on it and refuses a disabled person', async () => {
  await subscribe(ada, 1);
  await subscribe(owner, 1);
  expect(await owned('select staff_id from bomedia.push_subscriptions')).toEqual([{ staff_id: owner }]);
  await owned("update bomedia.staff set disabled_at = now() where id = $1", [ada]);
  await db.exec('savepoint refused');
  await expect(subscribe(ada, 9)).rejects.toMatchObject({ code: '42501' });
  await db.exec('rollback to savepoint refused');
});

it('queues a test alert for the person who asks, only once they have a phone on', async () => {
  await db.exec('savepoint none');
  await expect(call('select bomedia.api_push_test($1,$2::jsonb) as r', ['t0', JSON.stringify({ actor_id: ada, url: '/cashier/alerts' })])).rejects.toMatchObject({ code: '22023' });
  await db.exec('rollback to savepoint none');
  await subscribe(ada, 1);
  expect(await call('select bomedia.api_push_test($1,$2::jsonb) as r', ['t1', JSON.stringify({ actor_id: ada, url: '/cashier/alerts' })])).toEqual({ queued: 1 });
  const [item] = await claim();
  expect(item).toMatchObject({ kind: 'test', title: 'Phone alerts are on', url: '/cashier/alerts' });
  expect(item.targets).toHaveLength(1);
});
