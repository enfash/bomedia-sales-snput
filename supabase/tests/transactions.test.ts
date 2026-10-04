import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase, insertId } from './helpers';

let db: PGlite;
let customer: string;
let material: string;
let roll: string;
beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  customer = await insertId(db, `insert into bomedia.customers(display_name) values ('Test') returning id`);
  material = await insertId(db, `insert into bomedia.materials(name, width_ft, selling_price_per_sqft_kobo)
    values ('Flex', 6, 10000) returning id`);
  roll = await insertId(db, `insert into bomedia.inventory_rolls(material_id, item_name, width_ft, total_length_ft, remaining_length_ft)
    values ($1, 'Roll', 6, 10, 10) returning id`, [material]);
});
afterEach(async () => { await db.exec('rollback'); });

function item(length = '3') {
  return { description: 'Print', material_id: material, quantity: '1', unit_price_kobo: '10000', amount_kobo: '10000',
    tiled_length_ft: length, stock: [{ roll_id: roll, length_ft: length }] };
}
function sale(jobs = [item()]) {
  return { customer_id: customer, business_date: '2026-10-03', jobs };
}
async function recordSale(key: string, payload: object) {
  return (await db.query<{ result: { order_id: string; job_ids: string[]; initial_payment: unknown } }>(
    'select bomedia.record_sale($1, $2::jsonb) as result', [key, JSON.stringify(payload)])).rows[0].result;
}
async function recordPayment(key: string, jobs: string[], amount = '10000', extra = {}) {
  return (await db.query<{ result: { payment_id: string; amount_kobo: string; allocations: { kind: string; job_id: string; amount_kobo: string }[] } }>(
    'select bomedia.record_payment($1, $2::jsonb) as result', [key, JSON.stringify({ customer_id: customer,
      business_date: '2026-10-03', job_ids: jobs, amount_kobo: amount, ...extra })])).rows[0].result;
}

it('records sale, stock movement and initial cash atomically and replays without duplicates', async () => {
  const payload = { ...sale(), initial_payment_kobo: '5000' };
  const result = await recordSale('sale-1', payload);
  expect(result.initial_payment).toMatchObject({ amount_kobo: '5000' });
  expect(await recordSale('sale-1', payload)).toEqual(result);
  expect((await db.query('select id from bomedia.orders')).rows).toHaveLength(1);
  expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(1);
  expect((await db.query('select id from bomedia.inventory_movements')).rows).toHaveLength(1);
  expect((await db.query<{ remaining: string }>('select remaining_length_ft::text as remaining from bomedia.inventory_rolls')).rows[0].remaining).toBe('7.000000');
});

it('rolls back the entire multi-job sale when a later stock deduction fails', async () => {
  await db.exec('savepoint attempt');
  await expect(recordSale('too-large', sale([item('3'), item('9')]))).rejects.toMatchObject({ code: '23514' });
  await db.exec('rollback to savepoint attempt');
  expect((await db.query('select id from bomedia.orders')).rows).toHaveLength(0);
  expect((await db.query('select id from bomedia.inventory_movements')).rows).toHaveLength(0);
  expect((await db.query('select request_key from bomedia.idempotency_requests')).rows).toHaveLength(0);
  expect((await db.query<{ remaining: string }>('select remaining_length_ft::text as remaining from bomedia.inventory_rolls')).rows[0].remaining).toBe('10.000000');
  expect((await recordSale('too-large', sale([item('2')]))).job_ids).toHaveLength(1);
});

it('rejects changing a sale payload while reusing its request key', async () => {
  await recordSale('same-key', sale());
  await expect(recordSale('same-key', sale([item('2')]))).rejects.toMatchObject({ code: '22023' });
});

it('rejects stock deductions whose sum differs from the tiled job length', async () => {
  const bad = item('3');
  bad.stock[0].length_ft = '2';
  await expect(recordSale('wrong-length', sale([bad]))).rejects.toMatchObject({ code: '23514' });
});

it('rejects a mismatched quantity and price total', async () => {
  const bad = item();
  bad.amount_kobo = '9999';
  await expect(recordSale('wrong-price', sale([bad]))).rejects.toMatchObject({ code: '22023' });
});

it('allocates in original job order, splits rounding and does not repeat a payment', async () => {
  const { job_ids: jobs } = await recordSale('ordered-sale', sale([item('2'), item('2')]));
  const result = await recordPayment('collect-1', [...jobs].reverse(), '25000');
  expect(result.allocations).toEqual([
    { job_id: jobs[0], kind: 'settlement', amount_kobo: '10000' },
    { job_id: jobs[1], kind: 'settlement', amount_kobo: '10000' },
    { job_id: jobs[1], kind: 'rounding', amount_kobo: '5000' },
  ]);
  expect(await recordPayment('collect-1', [...jobs].reverse(), '25000')).toEqual(result);
  expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(1);
});

it('keeps rounding on an old job from cancelling another job debt', async () => {
  const { job_ids: jobs } = await recordSale('sale', sale([item('2'), item('2')]));
  await recordPayment('old-payment', [jobs[0]], '15000');
  const result = await recordPayment('new-payment', jobs, '10000');
  expect(result.allocations).toEqual([{ job_id: jobs[1], kind: 'settlement', amount_kobo: '10000' }]);
});

it('honours opening-balance adjustments without recording them as cash', async () => {
  const { job_ids: jobs } = await recordSale('sale', sale());
  await db.query(`insert into bomedia.job_adjustments(job_id, amount_kobo, kind, reason)
    values ($1, -4000, 'legacy_opening_balance', 'Reconciled prior collections')`, [jobs[0]]);
  const result = await recordPayment('payment', jobs, '6000');
  expect(result.allocations).toEqual([{ job_id: jobs[0], kind: 'settlement', amount_kobo: '6000' }]);
  expect(result.amount_kobo).toBe('6000');
});

it('rejects another customer’s job before creating a receipt', async () => {
  const { job_ids: jobs } = await recordSale('sale', sale());
  const other = await insertId(db, `insert into bomedia.customers(display_name) values ('Other') returning id`);
  await db.exec('savepoint attempt');
  await expect(recordPayment('payment', jobs, '10000', { customer_id: other })).rejects.toMatchObject({ code: '22023' });
  await db.exec('rollback to savepoint attempt');
  expect((await db.query('select id from bomedia.payments')).rows).toHaveLength(0);
});

it('rejects duplicate job IDs rather than applying one payment twice', async () => {
  const { job_ids: jobs } = await recordSale('sale', sale());
  await expect(recordPayment('payment', [jobs[0], jobs[0]])).rejects.toMatchObject({ code: '22023' });
});

it.each(['-1', '1.5', 'NaN', '0'])('rejects invalid payment kobo %s', async amount => {
  const { job_ids: jobs } = await recordSale('sale', sale());
  await expect(recordPayment('payment', jobs, amount)).rejects.toMatchObject({ code: '22023' });
});

it('denies browser roles execution of transaction functions', async () => {
  const result = await db.query<{ allowed: boolean }>(`select has_function_privilege('anon',
    'bomedia.record_payment(text,jsonb)', 'EXECUTE') as allowed`);
  expect(result.rows[0].allowed).toBe(false);
});
