export class OpeningError extends Error {}

export const CUTOVER_LOCK = "select pg_advisory_xact_lock(hashtextextended('bomedia:opening-balances',0))";
export const cleanName = name => String(name ?? '').trim().replace(/\s+/g, ' ');
export const nameKey = name => cleanName(name).toLowerCase();

/** Only the owner's explicit, unambiguous, single-hop decisions may rename a customer. */
export function resolveNameDecisions(rows) {
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
