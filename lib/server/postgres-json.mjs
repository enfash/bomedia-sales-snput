// pg/PGlite-compatible JSON-text parameters for Postgres.js. Once PostgreSQL
// identifies a parameter as jsonb, the default codec would encode its JSON text
// again as a scalar string. Decode that text once before serializing the value.
export function serializeJsonParameter(value) {
  return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value);
}
