import { sha256 } from './snapshot.mjs';

// Files retain their BEGIN/COMMIT wrapper for SQL-editor use. This runner owns
// the outer transaction, so schema changes and their ledger entries commit together.
export function prepareMigrations(files) {
  if (!files.length) throw new Error('No migrations supplied');
  const names = new Set();
  return [...files].sort((a, b) => a.name.localeCompare(b.name)).map(file => {
    if (!/^\d{12}_[a-z0-9_]+\.sql$/.test(file.name) || names.has(file.name)) throw new Error('Invalid or duplicate migration filename');
    names.add(file.name);
    const match = file.sql.match(/^(?:\s|--[^\n]*\n)*begin\s*;([\s\S]*)\bcommit\s*;\s*$/i);
    if (!match) throw new Error('Migration must have one outer BEGIN/COMMIT wrapper');
    return { name: file.name, checksum: sha256(file.sql), body: match[1] };
  });
}

export async function applyMigrations(db, files) {
  const migrations = prepareMigrations(files);
  return db.transaction(async tx => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended('bomedia:schema-migrations', 0))");
    const ledger = (await tx.query("select to_regclass('migration_control.applied_migrations') is not null as present")).rows[0].present;
    if (!ledger) {
      const existing = (await tx.query("select count(*)::integer as count from pg_namespace where nspname in ('bomedia', 'migration', 'migration_control')")).rows[0].count;
      if (existing) throw new Error('Existing schemas have no migration ledger; manual review required');
      await tx.exec(`create schema migration_control;
        revoke all on schema migration_control from public, anon, authenticated, service_role;
        create table migration_control.applied_migrations (
          name text primary key, checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
          applied_at timestamptz not null default now()
        );
        alter table migration_control.applied_migrations enable row level security;
        revoke all on migration_control.applied_migrations from public, anon, authenticated, service_role;`);
    }
    const prior = (await tx.query('select name, checksum from migration_control.applied_migrations order by name')).rows;
    for (const [index, row] of prior.entries()) {
      if (migrations[index]?.name !== row.name || migrations[index]?.checksum !== row.checksum) {
        throw new Error('Applied migration history differs from local files; refusing changes');
      }
    }
    const applied = [];
    for (const file of migrations.slice(prior.length)) {
      await tx.exec(file.body);
      await tx.query('insert into migration_control.applied_migrations(name, checksum) values ($1, $2)', [file.name, file.checksum]);
      applied.push(file.name);
    }
    return { applied, alreadyApplied: prior.map(row => row.name) };
  });
}
