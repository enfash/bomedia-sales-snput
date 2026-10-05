// Shared guard for the sandbox: reads .env.sandbox.local and refuses to run
// against the live project configured in .env.local. Never prints secrets.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const sandboxFile = '.env.sandbox.local';

export async function loadSandboxEnv() {
  let text;
  try { text = await readFile(join(root, sandboxFile), 'utf8'); }
  catch { throw new Error(`Create ${sandboxFile} first (see docs/sandbox.md).`); }
  const sandbox = parseEnv(text);
  let live = {};
  try { live = parseEnv(await readFile(join(root, '.env.local'), 'utf8')); } catch { /* no live config is fine */ }
  const ref = (sandbox.SUPABASE_MIGRATION_PROJECT_REF || '').trim();
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error('Set SUPABASE_MIGRATION_PROJECT_REF in .env.sandbox.local to the sandbox Project ID (20 characters).');
  const liveRefs = [live.SUPABASE_MIGRATION_PROJECT_REF, live.SUPABASE_PROJECT_REF].map(v => (v || '').trim()).filter(Boolean);
  if (liveRefs.includes(ref)) throw new Error('This is the LIVE project. The sandbox must use a different Supabase project.');
  const url = sandbox.SUPABASE_MIGRATION_DATABASE_URL || '';
  if (!url.includes(ref)) throw new Error('SUPABASE_MIGRATION_DATABASE_URL must be the sandbox project\'s connection string.');
  for (const key of ['SUPABASE_AUTH_DATABASE_URL', 'SUPABASE_FINANCIAL_DATABASE_URL']) {
    if (sandbox[key] && !sandbox[key].includes(ref)) throw new Error(`${key} does not belong to the sandbox project.`);
  }
  return { ...sandbox, SUPABASE_PROJECT_REF: ref, BOMEDIA_ENV_FILE: sandboxFile };
}
