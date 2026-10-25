import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { testDatabase } from './helpers';

let db: PGlite;
const VIEWS = ['v_contract', 'v_customers', 'v_customer_contacts', 'v_orders', 'v_jobs', 'v_payments', 'v_payment_allocations',
  'v_job_adjustments', 'v_customer_changes', 'v_expenses', 'v_daily_cost', 'v_job_cost', 'v_books', 'v_freshness'];

beforeAll(async () => { db = await testDatabase(); }, 30000);
afterAll(async () => { await db?.close(); });

const privilege = async (sql: string) => (await db.query<{ ok: boolean }>(`select ${sql} as ok`)).rows[0].ok;

it('gives the reader login select on the 14 live views', async () => {
  for (const view of VIEWS) {
    expect(await privilege(`has_table_privilege('bomedia_intelligence_read', 'intelligence.${view}', 'SELECT')`), view).toBe(true);
  }
  expect(await privilege(`has_schema_privilege('bomedia_intelligence_read', 'intelligence', 'USAGE')`)).toBe(true);
});

it('leaves the reader without any sales tables, and the view owner without rights in the schema', async () => {
  expect(await privilege(`has_table_privilege('bomedia_intelligence_read', 'bomedia.jobs', 'SELECT')`)).toBe(false);
  expect(await privilege(`has_table_privilege('bomedia_intelligence_read', 'bomedia.staff', 'SELECT')`)).toBe(false);
  expect(await privilege(`has_schema_privilege('intelligence_owner', 'intelligence', 'CREATE')`)).toBe(false);
  expect(await privilege(`has_schema_privilege('intelligence_owner', 'intelligence', 'USAGE')`)).toBe(false);
});
