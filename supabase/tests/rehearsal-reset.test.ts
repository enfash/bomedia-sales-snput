import { afterEach, describe, expect, it } from 'vitest';

import { testDatabase } from './helpers';
import { RehearsalError, assertRehearsalTarget, resetRehearsal } from '../../scripts/migration/rehearsal-reset.mjs';

const REH = 'abcdefghij0123456789', LIVE = 'zzzzzzzzzz9999999999', SANDBOX = 'sandboxref0000000001';

describe('rehearsal reset guard', () => {
  it('only accepts the rehearsal project, and refuses the live project, the old sandbox, a mistyped id and a missing rehearsal file', () => {
    expect(assertRehearsalTarget({ confirmedRef: REH, rehearsalRef: REH, protectedRefs: [LIVE, SANDBOX] })).toBe(REH);
    expect(() => assertRehearsalTarget({ confirmedRef: LIVE, rehearsalRef: REH, protectedRefs: [LIVE, SANDBOX] })).toThrow(RehearsalError);
    expect(() => assertRehearsalTarget({ confirmedRef: SANDBOX, rehearsalRef: REH, protectedRefs: [LIVE, SANDBOX] })).toThrow(/not the project named/);
    // Even if the rehearsal file wrongly names the live project, the live project is still protected.
    expect(() => assertRehearsalTarget({ confirmedRef: LIVE, rehearsalRef: LIVE, protectedRefs: [LIVE, SANDBOX] })).toThrow(/live project or the old sandbox/);
    expect(() => assertRehearsalTarget({ confirmedRef: 'short', rehearsalRef: REH, protectedRefs: [] })).toThrow(/20-character/);
    expect(() => assertRehearsalTarget({ confirmedRef: REH, rehearsalRef: undefined, protectedRefs: [] })).toThrow(/not the project named/);
  });
});

let db: Awaited<ReturnType<typeof testDatabase>>;
afterEach(async () => { await db?.close(); });

describe('rehearsal reset', () => {
  it('removes the application schemas and roles, can be repeated, and lets the migrations be applied again', async () => {
    db = await testDatabase();
    await db.exec("create role bomedia_financial_server login password 'x'; grant bomedia_financial_runtime to bomedia_financial_server;");
    expect((await db.query<{ n: number }>("select count(*)::integer n from information_schema.schemata where schema_name in ('bomedia','migration','migration_control')")).rows[0].n).toBeGreaterThanOrEqual(2); // migration_control is created by the apply tool, not by a migration file
    expect(await resetRehearsal(db)).toEqual({ wiped: true, schemasLeft: 0, rolesLeft: 0 });
    expect(await resetRehearsal(db)).toEqual({ wiped: true, schemasLeft: 0, rolesLeft: 0 });
    expect((await db.query<{ n: number }>("select count(*)::integer n from pg_roles where rolname like 'bomedia%'")).rows[0].n).toBe(0);
  });
});
