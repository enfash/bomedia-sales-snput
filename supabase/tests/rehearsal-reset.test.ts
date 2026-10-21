import { afterEach, describe, expect, it } from 'vitest';

import { testDatabase } from './helpers';
import { LIVE_PROJECT_REF, RehearsalError, assertRehearsalTarget, rehearsalTargetFromFiles, resetRehearsal } from '../../scripts/migration/rehearsal-reset.mjs';

const REH = 'abcdefghij0123456789', LIVE = 'zzzzzzzzzz9999999999', SANDBOX = 'sandboxref0000000001';

describe('rehearsal reset guard', () => {
  it('always protects live, even with a wrong rehearsal config or missing protection list', () => {
    for (const protectedRefs of [[], [SANDBOX]]) {
      expect(() => assertRehearsalTarget({ confirmedRef: LIVE_PROJECT_REF, rehearsalRef: LIVE_PROJECT_REF, protectedRefs })).toThrow(/always protected/);
    }
    expect(() => assertRehearsalTarget({ confirmedRef: REH, rehearsalRef: REH, protectedRefs: [] })).toThrow(/Cannot establish protected/);
  });

  it('fails closed on either missing protection file or absent/invalid IDs, without reading real files', async () => {
    const configs: Record<string, Record<string, string>> = {
      '.env.local': { SUPABASE_MIGRATION_PROJECT_REF: LIVE },
      '.env.sandbox.paused.local': { SUPABASE_PROJECT_REF: SANDBOX },
      '.env.rehearsal.local': { SUPABASE_MIGRATION_PROJECT_REF: REH },
    };
    const read = async (file: string) => configs[file];
    expect(await rehearsalTargetFromFiles(REH, read)).toBe(REH);
    for (const missing of ['.env.local', '.env.sandbox.paused.local']) {
      await expect(rehearsalTargetFromFiles(REH, async (file: string) => {
        if (file === missing) throw new Error('missing');
        return configs[file];
      })).rejects.toThrow(/Cannot establish protected/);
      for (const bad of [{}, { SUPABASE_PROJECT_REF: 'bad' }]) {
        await expect(rehearsalTargetFromFiles(REH, async (file: string) => file === missing ? bad : configs[file])).rejects.toThrow(/Cannot establish protected/);
      }
    }
    configs['.env.rehearsal.local'] = { SUPABASE_MIGRATION_PROJECT_REF: LIVE_PROJECT_REF };
    await expect(rehearsalTargetFromFiles(LIVE_PROJECT_REF, read)).rejects.toThrow(/always protected/);
  });
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
