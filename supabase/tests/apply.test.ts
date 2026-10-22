import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { applyMigrations } from '../../scripts/migration/apply.mjs';

const directory = new URL('../migrations/', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.sql'))
  .map(name => ({ name, sql: readFileSync(new URL(name, directory), 'utf8') }));
let db: PGlite;
async function fresh() {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  return db;
}
afterEach(async () => { await db?.close(); });

it('applies actual migrations once, records checksums and protects the ledger from API roles', async () => {
  await fresh();
  expect((await applyMigrations(db, files)).applied).toHaveLength(files.length);
  expect(await applyMigrations(db, files)).toEqual({ applied: [], alreadyApplied: files.map(file => file.name) });
  const access = await db.query<{ allowed: boolean }>(`select has_schema_privilege(role_name, 'migration_control', 'USAGE')
    or has_table_privilege(role_name, 'migration_control.applied_migrations', 'SELECT,INSERT,UPDATE,DELETE') as allowed
    from unnest(array['anon','authenticated','service_role']) as role_name`);
  expect(access.rows.every(row => !row.allowed)).toBe(true);
}, 30_000);

it('rolls back all DDL and its ledger if a later migration fails', async () => {
  await fresh();
  await expect(applyMigrations(db, [...files,
    { name: '202610040001_failure.sql', sql: 'begin; select * from nonexistent_failure_table; commit;' },
  ])).rejects.toThrow();
  const result = await db.query<{ count: number }>("select count(*)::integer as count from pg_namespace where nspname in ('bomedia','migration','migration_control')");
  expect(result.rows[0].count).toBe(0);
}, 30_000);

it('refuses altered or missing applied migrations and backdated insertions', async () => {
  await fresh();
  await applyMigrations(db, files);
  await expect(applyMigrations(db, files.map((file, i) => i ? file : { ...file, sql: file.sql + '\n' }))).rejects.toThrow('history differs');
  await expect(applyMigrations(db, files.slice(0, 1))).rejects.toThrow('history differs');
  await expect(applyMigrations(db, [{ name: '202610020001_earlier.sql', sql: 'begin; select 1; commit;' }, ...files])).rejects.toThrow('history differs');
}, 30_000);

it('refuses to adopt existing schemas without a ledger', async () => {
  await fresh();
  await db.exec('create schema bomedia');
  await expect(applyMigrations(db, files)).rejects.toThrow('manual review');
}, 30_000);
