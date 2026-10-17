import { describe, expect, it, vi } from 'vitest';
import { EXPECTED_LATEST_MIGRATION, EXPECTED_MIGRATION_COUNT } from '../schema-version';
import { judgeSchema, readSystemStatus, sheetsStatus } from './system-status';

const now = new Date('2026-10-11T04:41:00Z');
const snapshot = { schema: { tracked: true, applied: EXPECTED_MIGRATION_COUNT, latest: EXPECTED_LATEST_MIGRATION },
  last_sale: { reference: 'BOM-20261008-0006', at: '2026-10-08T11:25:00Z' }, last_payment: null,
  last_expense: { reference: 'EXP-20261011-0005', at: '2026-10-11T03:06:00Z' }, today: { sales: 0, payments: 0, expenses: 3 } };

describe('judging the database version', () => {
  it('says current, behind, ahead or unknown', () => {
    expect(judgeSchema(snapshot.schema)).toMatchObject({ state: 'current', behindBy: 0 });
    expect(judgeSchema({ tracked: true, applied: EXPECTED_MIGRATION_COUNT - 2, latest: '202610100030_old.sql' })).toMatchObject({ state: 'behind', behindBy: 2 });
    expect(judgeSchema({ tracked: true, applied: 1, latest: '202610100030_old.sql' }).behindBy).toBeGreaterThanOrEqual(1);
    expect(judgeSchema({ tracked: true, applied: EXPECTED_MIGRATION_COUNT + 1, latest: '299912310001_future.sql' })).toMatchObject({ state: 'ahead' });
    expect(judgeSchema({ tracked: false, applied: null, latest: null })).toMatchObject({ state: 'unknown' });
  });
});

describe('reading the status', () => {
  it('reports a reachable database with its answer time and the latest activity', async () => {
    const call = vi.fn().mockResolvedValue(snapshot);
    const times = [1000, 1084];
    const status = await readSystemStatus(call, () => now, true, () => times.shift() as number);
    expect(call).toHaveBeenCalledWith('api_system_status', '', {});
    expect(status).toMatchObject({ backend: 'postgres', testDatabase: true, database: { reachable: true, ms: 84 },
      schema: { state: 'current' }, lastSale: { reference: 'BOM-20261008-0006' }, lastPayment: null, today: { expenses: 3 }, checkedAt: now.toISOString() });
  });

  it('treats an unreachable database as a normal answer, with no details leaked', async () => {
    const status = await readSystemStatus(vi.fn().mockRejectedValue(new Error('password authentication failed for user x')), () => now, false);
    expect(status).toMatchObject({ backend: 'postgres', database: { reachable: false, ms: null }, today: null, lastSale: null });
    expect(JSON.stringify(status)).not.toContain('password');
  });

  it('describes Google Sheets without asking the database anything', () => {
    expect(sheetsStatus(now, false)).toMatchObject({ backend: 'sheets', database: { reachable: false }, today: null });
  });
});
