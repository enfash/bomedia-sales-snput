/**
 * Keeps customer names consistent without imposing a spelling rule.
 *
 * The sheet groups sales by exact client name, so "Ola" and "ola" become two
 * customers and their debts stop adding up. The obvious fix — forcing Title
 * Case on input — is worse than the problem: of 165 existing names, 62 do not
 * match Title Case, including acronyms ("HK Advertisement", "TWS", "OA design")
 * and ordinary lowercase second words ("Old school", "Fruit print"). Rewriting
 * those would split each one into a new customer and orphan its history.
 *
 * So nothing is imposed. A typed name is matched against the names already in
 * the sheet, and when one matches it is replaced by that existing spelling —
 * whatever it happens to be. A genuinely new customer is stored as typed.
 */

/** Trims and collapses runs of whitespace. "Mr  Lucky" -> "Mr Lucky". */
export function normalizeClientName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Comparison key: case and spacing carry no meaning when matching. */
function matchKey(name: string): string {
  return normalizeClientName(name).toLowerCase();
}

/**
 * Resolves a typed name to the spelling already used for that customer.
 *
 * Returns the existing name when one matches ignoring case and spacing,
 * otherwise the typed name tidied up. Never invents a capitalisation.
 *
 * `knownClients` should be the raw list of names, one entry per sale, NOT a
 * deduplicated set — the duplicates are what identify the dominant spelling
 * when the sheet already disagrees with itself.
 */
export function canonicalClientName(raw: string, knownClients: string[]): string {
  const tidied = normalizeClientName(raw);
  if (!tidied) return "";

  const key = matchKey(tidied);
  // Prefer the most-used spelling when the sheet already disagrees with itself
  // (e.g. both "Mr Oye" and "Mr oye" exist), so entries converge on one name
  // rather than alternating with whichever was found first.
  let best: string | null = null;
  let bestCount = 0;
  const counts = new Map<string, number>();

  for (const name of knownClients) {
    if (matchKey(name) !== key) continue;
    const tidiedKnown = normalizeClientName(name);
    const n = (counts.get(tidiedKnown) ?? 0) + 1;
    counts.set(tidiedKnown, n);
    if (n > bestCount) {
      best = tidiedKnown;
      bestCount = n;
    }
  }

  return best ?? tidied;
}
