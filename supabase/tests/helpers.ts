import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

export async function testDatabase() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  for (const file of readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`${directory}/${file}`, 'utf8'));
  }
  return db;
}

export async function insertId(db: PGlite, sql: string, params: unknown[] = []) {
  return (await db.query<{ id: string }>(sql, params)).rows[0].id;
}
