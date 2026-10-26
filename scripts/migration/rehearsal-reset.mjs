// Wipes the REHEARSAL project so the whole cutover sequence can be rehearsed again from nothing.
// This is destructive, so it only runs against the one project named in .env.rehearsal.local, and never against the live project or the old sandbox.

export class RehearsalError extends Error {}

export const LIVE_PROJECT_REF = 'rozlwzhwrbbrwtzfvjxc';
const validRef = value => typeof value === 'string' && /^[a-z0-9]{20}$/.test(value.trim());

// The reader is injected so tests never open private configuration files.
export async function rehearsalTargetFromFiles(confirmedRef, readConfig) {
  const protectedRefs = [];
  for (const file of ['.env.local', '.env.sandbox.paused.local']) {
    let config;
    try { config = await readConfig(file); }
    catch { throw new RehearsalError(`Cannot establish protected project IDs from ${file}. Nothing was wiped.`); }
    const refs = [config?.SUPABASE_MIGRATION_PROJECT_REF, config?.SUPABASE_PROJECT_REF].filter(value => value !== undefined);
    if (!refs.length || refs.some(value => !validRef(value))) throw new RehearsalError(`Cannot establish protected project IDs from ${file}. Nothing was wiped.`);
    protectedRefs.push(...refs.map(value => value.trim()));
  }
  let rehearsal;
  try { rehearsal = await readConfig('.env.rehearsal.local'); }
  catch { throw new RehearsalError('Cannot establish the rehearsal project ID. Nothing was wiped.'); }
  return assertRehearsalTarget({ confirmedRef, rehearsalRef: rehearsal?.SUPABASE_MIGRATION_PROJECT_REF, protectedRefs });
}

const SCHEMAS = ['migration_control', 'migration', 'bomedia', 'intelligence'];
const ROLES = ['bomedia_auth_server', 'bomedia_financial_server', 'bomedia_auth_runtime', 'bomedia_financial_runtime', 'bomedia_intelligence_read', 'intelligence_owner'];

/** The only project this may touch is the rehearsal project. Every other known project is refused, even if it was confirmed by mistake. */
export function assertRehearsalTarget({ confirmedRef, rehearsalRef, protectedRefs }) {
  const ref = String(confirmedRef ?? '').trim();
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new RehearsalError('Give the 20-character Project ID of the rehearsal project.');
  if (ref === LIVE_PROJECT_REF) throw new RehearsalError('The live project is always protected. Nothing was wiped.');
  if (!rehearsalRef || ref !== String(rehearsalRef).trim()) throw new RehearsalError('This is not the project named in .env.rehearsal.local. Nothing was wiped.');
  if (!Array.isArray(protectedRefs) || !protectedRefs.length || protectedRefs.some(other => !validRef(other))) {
    throw new RehearsalError('Cannot establish protected project IDs. Nothing was wiped.');
  }
  if (protectedRefs.some(other => other && String(other).trim() === ref)) throw new RehearsalError('This is your live project or the old sandbox. It is never wiped. Nothing was changed.');
  return ref;
}

/** Drops the application schemas and the application database roles. Safe to repeat on an already empty project. */
export async function resetRehearsal(db) {
  return db.transaction(async tx => {
    for (const schema of SCHEMAS) await tx.query(`drop schema if exists ${schema} cascade`);
    for (const role of ROLES) {
      // These roles own nothing once the schemas are gone (a hosted project does not allow DROP OWNED), so they can be dropped directly.
      if ((await tx.query('select 1 from pg_roles where rolname=$1', [role])).rows.length) await tx.query(`drop role ${role}`);
    }
    const left = (await tx.query(`select (select count(*)::integer from information_schema.schemata where schema_name = any($1::text[])) as schemas,
      (select count(*)::integer from pg_roles where rolname = any($2::text[])) as roles`, [SCHEMAS, ROLES])).rows[0];
    return { wiped: left.schemas === 0 && left.roles === 0, schemasLeft: left.schemas, rolesLeft: left.roles };
  });
}
