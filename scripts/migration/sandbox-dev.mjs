// Runs the app against the sandbox on port 3001. Sandbox settings override
// .env.local; Google Sheets is blocked so old screens cannot write live data.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadSandboxEnv, root } from './sandbox-env.mjs';

try {
  const sandbox = await loadSandboxEnv();
  for (const key of ['SUPABASE_AUTH_DATABASE_URL', 'SUPABASE_FINANCIAL_DATABASE_URL', 'SUPABASE_ADMIN_STAFF_ID']) {
    if (!sandbox[key]) throw new Error(`${key} is missing. Run npm run sandbox:setup first.`);
  }
  const env = { ...process.env, ...sandbox, AUTH_BACKEND: 'postgres', POSTGRES_FINANCIAL_API_ENABLED: 'true',
    GOOGLE_SHEET_ID: 'sandbox-sheets-blocked', SUPABASE_DATABASE_URL: '' };
  console.log('Sandbox: http://localhost:3001/bom03/accounting  ·  Google Sheets blocked  ·  live data untouched');
  const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3001'], { cwd: root, env, stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : 'Sandbox start failed.'}`);
  process.exit(1);
}
