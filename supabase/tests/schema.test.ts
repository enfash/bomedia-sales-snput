import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let db: PGlite;

async function id(sql: string, params: unknown[] = []) {
  const result = await db.query<{ id: string }>(sql, params);
  return result.rows[0].id;
}

async function customer(name = 'Test Customer') {
  return id('insert into bomedia.customers(display_name) values ($1) returning id', [name]);
}

async function job(customerId: string, legacyId = 'REPEATED-SALES-ID') {
  const orderId = await id(`insert into bomedia.orders(customer_id, legacy_sales_id)
    values ($1, $2) returning id`, [customerId, legacyId]);
  return id(`insert into bomedia.jobs(order_id, customer_id, description, quantity,
    unit_price_kobo, amount_kobo, job_status, business_date)
    values ($1, $2, 'Test print', 1, 10000, 10000, 'Pending', '2026-10-03') returning id`,
  [orderId, customerId]);
}

beforeAll(async () => {
  db = new PGlite();
  // Model Supabase API roles without connecting to a hosted service.
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  for (const file of readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`${directory}/${file}`, 'utf8'));
  }
}, 30_000);

beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });

describe('Supabase schema foundation', () => {
  it('uses exact integer kobo beyond JavaScript safe integers and preserves business dates', async () => {
    const customerId = await customer();
    const jobId = await job(customerId);
    await db.query('update bomedia.jobs set amount_kobo = $1 where id = $2', ['9007199254740993', jobId]);
    const result = await db.query<{ amount: string; date: string }>(`
      select amount_kobo::text as amount, business_date::text as date from bomedia.jobs where id = $1`, [jobId]);
    expect(result.rows[0]).toEqual({ amount: '9007199254740993', date: '2026-10-03' });
  });

  it('keeps matching customer names and repeated historical sales IDs separate', async () => {
    const first = await customer();
    const second = await customer();
    expect(first).not.toBe(second);
    expect(await job(first)).not.toBe(await job(second));
  });

  it('refuses a payment allocation to a different customer', async () => {
    const first = await customer('First');
    const second = await customer('Second');
    const jobId = await job(second);
    const paymentId = await id(`insert into bomedia.payments(customer_id, amount_kobo)
      values ($1, 10000) returning id`, [first]);
    await expect(db.query(`insert into bomedia.payment_allocations
      (payment_id, job_id, customer_id, amount_kobo, kind) values ($1, $2, $3, 10000, 'settlement')`,
    [paymentId, jobId, first])).rejects.toMatchObject({ code: '23503' });
  });

  it('records one cash receipt with separate settlement and rounding allocations', async () => {
    const customerId = await customer();
    const jobId = await job(customerId);
    const paymentId = await id(`insert into bomedia.payments(customer_id, amount_kobo)
      values ($1, 10100) returning id`, [customerId]);
    await db.query(`insert into bomedia.payment_allocations
      (payment_id, job_id, customer_id, amount_kobo, kind)
      values ($1, $2, $3, 10000, 'settlement'), ($1, $2, $3, 100, 'rounding')`,
    [paymentId, jobId, customerId]);
    const result = await db.query<{ cash: string; allocated: string; rounding: string }>(`
      select (select sum(amount_kobo)::text from bomedia.payments) as cash,
        sum(amount_kobo)::text as allocated,
        sum(amount_kobo) filter (where kind = 'rounding')::text as rounding
      from bomedia.payment_allocations`);
    expect(result.rows[0]).toEqual({ cash: '10100', allocated: '10100', rounding: '100' });
  });

  it('rolls a receipt back when an allocation fails in the same transaction', async () => {
    const customerId = await customer();
    const jobId = await job(customerId);
    await db.exec('savepoint payment_operation');
    const paymentId = await id(`insert into bomedia.payments(customer_id, amount_kobo)
      values ($1, 10000) returning id`, [customerId]);
    await expect(db.query(`insert into bomedia.payment_allocations
      (payment_id, job_id, customer_id, amount_kobo, kind) values ($1, $2, $3, -1, 'settlement')`,
    [paymentId, jobId, customerId])).rejects.toMatchObject({ code: '23514' });
    await db.exec('rollback to savepoint payment_operation');
    expect((await db.query('select * from bomedia.payments')).rows).toHaveLength(0);
    expect((await db.query('select * from bomedia.jobs')).rows).toHaveLength(1);
  });

  it.each(['-1', 'NaN', '101'])('rejects invalid remaining stock %s', async remaining => {
    const materialId = await id(`insert into bomedia.materials(name, width_ft, selling_price_per_sqft_kobo)
      values ('Flex', 6, 10000) returning id`);
    await expect(db.query(`insert into bomedia.inventory_rolls
      (material_id, item_name, width_ft, total_length_ft, remaining_length_ft)
      values ($1, 'Roll', 6, 100, $2)`, [materialId, remaining])).rejects.toMatchObject({ code: '23514' });
  });

  it('prevents assigning an active roll from a different material', async () => {
    const first = await id(`insert into bomedia.materials(name, width_ft, selling_price_per_sqft_kobo)
      values ('Flex', 6, 10000) returning id`);
    const second = await id(`insert into bomedia.materials(name, width_ft, selling_price_per_sqft_kobo)
      values ('SAV', 4, 20000) returning id`);
    const rollId = await id(`insert into bomedia.inventory_rolls
      (material_id, item_name, width_ft, total_length_ft, remaining_length_ft)
      values ($1, 'Roll', 6, 100, 100) returning id`, [first]);
    await expect(db.query('update bomedia.materials set active_roll_id = $1 where id = $2',
      [rollId, second])).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects a duplicate offline operation key', async () => {
    const sql = `insert into bomedia.idempotency_requests(operation, request_key, payload_sha256, response)
      values ('sale', 'offline-001', $1, '{"ok":true}')`;
    await db.query(sql, ['a'.repeat(64)]);
    await expect(db.query(sql, ['b'.repeat(64)])).rejects.toMatchObject({ code: '23505' });
  });

  it('preserves empty sheets and prevents importing a snapshot row twice', async () => {
    const snapshot = await id(`insert into migration.snapshots(workbook_id, sha256, captured_at, archive_reference)
      values ('synthetic-workbook', $1, now(), 'encrypted-test-archive') returning id`, ['a'.repeat(64)]);
    const sheet = await id(`insert into migration.source_sheets(snapshot_id, sheet_id, title, position)
      values ($1, 1, 'Empty template', 0) returning id`, [snapshot]);
    expect((await db.query('select * from migration.source_rows')).rows).toHaveLength(0);
    const sql = `insert into migration.source_rows(sheet_id, row_number, cells) values ($1, 2, '[]')`;
    await db.query(sql, [sheet]);
    await expect(db.query(sql, [sheet])).rejects.toMatchObject({ code: '23505' });
  });

  it('requires unique certificate identities and prevents gateway nonce reuse', async () => {
    await db.query(`insert into bomedia.approved_devices(certificate_sha256, label)
      values ($1, 'Phone')`, ['a'.repeat(64)]);
    await db.exec('savepoint duplicate_device');
    await expect(db.query(`insert into bomedia.approved_devices(certificate_sha256, label)
      values ($1, 'Another phone')`, ['a'.repeat(64)])).rejects.toMatchObject({ code: '23505' });
    await db.exec('rollback to savepoint duplicate_device');
    const sql = `insert into bomedia.gateway_nonces(nonce_hash, expires_at) values ($1, now() + interval '2 minutes')`;
    await db.query(sql, ['b'.repeat(64)]);
    await expect(db.query(sql, ['b'.repeat(64)])).rejects.toMatchObject({ code: '23505' });
  });

  it('enables row-level security on every business and migration table', async () => {
    const result = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('bomedia', 'migration') and c.relkind = 'r' and not c.relrowsecurity`);
    expect(result.rows).toHaveLength(0);
  });

  it.each(['anon', 'authenticated', 'service_role'])('denies %s access to both private schemas', async role => {
    const result = await db.query<{ business: boolean; staging: boolean }>(`
      select has_schema_privilege($1, 'bomedia', 'USAGE') as business,
        has_schema_privilege($1, 'migration', 'USAGE') as staging`, [role]);
    expect(result.rows[0]).toEqual({ business: false, staging: false });
    // Role comes only from the fixed test list above.
    await db.exec(`set local role ${role}`);
    await expect(db.query('select * from bomedia.staff')).rejects.toMatchObject({ code: '42501' });
  });

  it('still denies customer rows if a browser role is accidentally granted SELECT', async () => {
    await customer();
    await db.exec(`grant usage on schema bomedia to authenticated;
      grant select on bomedia.customers to authenticated;
      set local role authenticated;`);
    expect((await db.query('select * from bomedia.customers')).rows).toHaveLength(0);
  });
});
