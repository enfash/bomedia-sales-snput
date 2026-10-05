// One command to prepare the sandbox: apply every migration, create the two
// restricted logins, and add test data. Safe to run again. Never prints secrets.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadSandboxEnv, root } from './sandbox-env.mjs';

function run(label, args, env) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) { console.error(`✖ ${label} failed. Nothing was done to the live project.`); process.exit(1); }
}
try {
  let env = { ...process.env, ...await loadSandboxEnv() };
  const ref = env.SUPABASE_MIGRATION_PROJECT_REF;
  run('Applying database changes to the sandbox', [join(root, 'scripts/migration/cli.mjs'), 'apply', '--confirm-project', ref], env);
  run('Creating the restricted login for sign-in', [join(root, 'scripts/migration/provision-auth.mjs'), '--confirm-project', ref], env);
  env = { ...process.env, ...await loadSandboxEnv() };
  run('Creating the restricted login for accounting', [join(root, 'scripts/migration/provision-financial.mjs'), '--confirm-project', ref], env);
  env = { ...process.env, ...await loadSandboxEnv() };
  run('Adding test staff, customers, materials, rolls and services', [join(root, 'scripts/migration/sandbox-seed.mjs')], env);
  console.log('\n✔ Sandbox ready. Start it with: npm run sandbox:dev');
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : 'Sandbox setup failed.'}`);
  process.exit(1);
}
