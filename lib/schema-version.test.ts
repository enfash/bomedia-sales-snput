import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { EXPECTED_LATEST_MIGRATION, EXPECTED_MIGRATION_COUNT } from './schema-version';

it('matches the migration files, so the status page never judges "up to date" against a stale version', () => {
  const files = readdirSync(join(process.cwd(), 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  expect(EXPECTED_MIGRATION_COUNT).toBe(files.length);
  expect(EXPECTED_LATEST_MIGRATION).toBe(files[files.length - 1]);
});
