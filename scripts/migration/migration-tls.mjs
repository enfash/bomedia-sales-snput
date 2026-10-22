import { readFile } from 'node:fs/promises';

/** An optional private CA augments verified TLS; otherwise Node uses its system/default trust store. */
export async function migrationTlsOptions(caPath, read = readFile) {
  return { rejectUnauthorized: true, ...(caPath ? { ca: await read(caPath, 'utf8') } : {}) };
}
