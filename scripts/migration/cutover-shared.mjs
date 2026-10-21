import { createHash } from 'node:crypto';

export class OpeningError extends Error {}

export const CUTOVER_LOCK = "select pg_advisory_xact_lock(hashtextextended('bomedia:opening-balances',0))";
// Wait at most 30 seconds for another cutover command, then stop with a clear message instead of hanging until the database gives up.
export const CUTOVER_LOCK_TIMEOUT = "set local lock_timeout = '30s'";
export const CUTOVER_BUSY_MESSAGE = 'Another cutover command is still running or did not finish. Wait a few minutes and run this command once more. Do not repeat it quickly; tell Claude if it keeps happening. Nothing was changed.';
const isLockTimeout = error => error?.code === '55P03';
/** Takes the shared cutover lock; a wait that times out (code 55P03 or 57014) becomes the plain message above. The 30 second lock_timeout stays on for the rest of the transaction. */
export async function takeCutoverLock(tx, ErrorClass = OpeningError) {
  await tx.query(CUTOVER_LOCK_TIMEOUT);
  try { await tx.query(CUTOVER_LOCK); }
  catch (error) { if (isLockTimeout(error) || error?.code === '57014') throw new ErrorClass(CUTOVER_BUSY_MESSAGE); throw error; }
}
/**
 * One transaction for a cutover command: takes the shared lock first, then runs `work`. Because lock_timeout stays set, any later row or table lock wait is also bounded,
 * and its timeout (55P03) becomes the same plain message. Nothing is changed when this throws, because the transaction rolls back.
 */
export function cutoverTransaction(db, ErrorClass, work) {
  return db.transaction(async tx => {
    await takeCutoverLock(tx, ErrorClass);
    try { return await work(tx); }
    catch (error) { if (isLockTimeout(error)) throw new ErrorClass(CUTOVER_BUSY_MESSAGE); throw error; }
  });
}
export const cleanName = name => String(name ?? '').trim().replace(/\s+/g, ' ');
export const nameKey = name => cleanName(name).toLowerCase();

/** Only the owner's explicit, unambiguous, single-hop decisions may rename a customer. */
export function resolveNameDecisions(rows) {
  // A file with rows must have the two expected columns; otherwise its decisions would silently be ignored.
  if (rows.length && !rows.every(row => 'name_in_sheet' in row && 'same_person_as' in row)) {
    throw new OpeningError('2-name-decisions.csv must have the columns name_in_sheet and same_person_as. Nothing was loaded.');
  }
  const targets = new Map();
  for (const [index, row] of rows.entries()) {
    const from = cleanName(row.name_in_sheet), to = cleanName(row.same_person_as);
    if (!from && !to) continue;
    if (!from || !to) throw new OpeningError(`2-name-decisions.csv line ${index + 2}: both name_in_sheet and same_person_as are needed.`);
    const key = nameKey(from);
    if (targets.has(key) && nameKey(targets.get(key).to) !== nameKey(to)) throw new OpeningError(`2-name-decisions.csv: "${from}" is mapped to two different names.`);
    if (!targets.has(key)) targets.set(key, { from: key, to, rowsChanged: 0 });
  }
  const aliases = new Map([...targets].filter(([from, value]) => from !== nameKey(value.to)));
  for (const value of aliases.values()) {
    if (aliases.has(nameKey(value.to))) throw new OpeningError(`2-name-decisions.csv: "${value.to}" is itself renamed. Point both spellings at the final name.`);
  }
  return {
    resolve(name) {
      const alias = aliases.get(nameKey(name));
      if (alias) { alias.rowsChanged++; return alias.to; }
      return cleanName(name);
    },
    decisions: [...aliases.values()].sort((a, b) => a.from.localeCompare(b.from)),
    fingerprint: decisionsFingerprint([...aliases.values()]),
  };
}

/** Never choose the first of multiple database identities for a normalized/approved name. */
export function indexCustomers(rows, decisions = []) {
  const aliases = new Map(decisions.map(d => [d.from, nameKey(d.to)]));
  const result = new Map();
  for (const row of rows) {
    const key = aliases.get(nameKey(row.display_name)) ?? nameKey(row.display_name);
    if (result.has(key)) throw new OpeningError(`Ambiguous database customers for "${key}". Resolve their identities before loading.`);
    result.set(key, row.id);
  }
  return result;
}

/** One fingerprint of the owner's name decisions, recorded when the opening posts and required to match when history loads. */
export function decisionsFingerprint(decisions) {
  const canonical = decisions.map(d => [nameKey(d.from), nameKey(d.to)]).sort((a, b) => a[0].localeCompare(b[0]));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
