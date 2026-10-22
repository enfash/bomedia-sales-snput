// Builds the app and runs it as a production server against the SANDBOX on port 3003, for testing things that need a production build and a
// secure (https) address, such as phone alerts. Put a secure tunnel in front of it, for example: cloudflared tunnel --url http://localhost:3003
// Sandbox settings override .env.local; Google Sheets is blocked; the live project is never used.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadSandboxEnv, root } from './sandbox-env.mjs';

const PORT = '3003';
const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), ...args], { cwd: root, env, stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`next ${args[0]} failed (${code})`))));
  process.on('SIGINT', () => child.kill('SIGINT'));
});

try {
  const sandbox = await loadSandboxEnv();
  for (const key of ['SUPABASE_AUTH_DATABASE_URL', 'SUPABASE_FINANCIAL_DATABASE_URL', 'SUPABASE_ADMIN_STAFF_ID']) {
    if (!sandbox[key]) throw new Error(`${key} is missing. Run npm run sandbox:setup first.`);
  }
  const env = { ...process.env, ...sandbox, AUTH_BACKEND: 'postgres', POSTGRES_FINANCIAL_API_ENABLED: 'true', GOOGLE_SHEET_ID: 'sandbox-sheets-blocked',
    SUPABASE_DATABASE_URL: '', BOMEDIA_SANDBOX: 'true', NEXT_DIST_DIR: '.next-prod', NODE_ENV: 'production' };
  console.log('Building for the sandbox (this takes a minute or two)…');
  await run(['build'], env);
  console.log(`\nSandbox, production build: http://localhost:${PORT}  ·  Google Sheets blocked  ·  live data untouched`);
  console.log(`Secure link for a phone: cloudflared tunnel --url http://localhost:${PORT}\n`);
  await run(['start', '-p', PORT], env);
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : 'Sandbox start failed.'}`);
  process.exit(1);
}
