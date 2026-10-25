import { EXPECTED_LATEST_MIGRATION, EXPECTED_MIGRATION_COUNT } from '../schema-version';
import { callFinancial, type FinancialCall } from './financial-db';

export type Seen = { reference: string | null; at: string } | null;
export type SchemaState = 'current' | 'behind' | 'ahead' | 'unknown';
export type SystemStatus = {
  checkedAt: string;
  backend: 'postgres' | 'sheets';
  testDatabase: boolean;
  database: { reachable: boolean; ms: number | null };
  schema: { state: SchemaState; applied: number | null; expected: number; behindBy: number };
  lastSale: Seen; lastPayment: Seen; lastExpense: Seen;
  today: { sales: number; payments: number; expenses: number } | null;
};
type Snapshot = { schema: { tracked: boolean; applied: number | null; latest: string | null };
  last_sale: Seen; last_payment: Seen; last_expense: Seen; today: { sales: number; payments: number; expenses: number } };

// Compares the database's newest applied migration with the one this build expects. Names start with their date, so text order is time order.
export function judgeSchema(schema: Snapshot['schema']): SystemStatus['schema'] {
  const expected = EXPECTED_MIGRATION_COUNT;
  if (!schema.tracked || !schema.latest) return { state: 'unknown', applied: schema.applied, expected, behindBy: 0 };
  if (schema.latest < EXPECTED_LATEST_MIGRATION) return { state: 'behind', applied: schema.applied, expected, behindBy: Math.max(1, expected - (schema.applied ?? 0)) };
  if (schema.latest > EXPECTED_LATEST_MIGRATION) return { state: 'ahead', applied: schema.applied, expected, behindBy: 0 };
  return { state: 'current', applied: schema.applied, expected, behindBy: 0 };
}

export function sheetsStatus(now: Date, testDatabase: boolean): SystemStatus {
  return { checkedAt: now.toISOString(), backend: 'sheets', testDatabase, database: { reachable: false, ms: null },
    schema: { state: 'unknown', applied: null, expected: EXPECTED_MIGRATION_COUNT, behindBy: 0 },
    lastSale: null, lastPayment: null, lastExpense: null, today: null };
}

// A database that cannot be reached is a normal answer for this page, not an error.
export async function readSystemStatus(call: FinancialCall = callFinancial, clock: () => Date = () => new Date(),
  testDatabase = process.env.BOMEDIA_SANDBOX === 'true', timer: () => number = () => performance.now()): Promise<SystemStatus> {
  const started = timer();
  try {
    const snapshot = await call<Snapshot>('api_system_status', '', {});
    const ms = Math.max(0, Math.round(timer() - started));
    return { checkedAt: clock().toISOString(), backend: 'postgres', testDatabase, database: { reachable: true, ms },
      schema: judgeSchema(snapshot.schema), lastSale: snapshot.last_sale ?? null, lastPayment: snapshot.last_payment ?? null,
      lastExpense: snapshot.last_expense ?? null, today: snapshot.today };
  } catch {
    return { ...sheetsStatus(clock(), testDatabase), backend: 'postgres' };
  }
}
