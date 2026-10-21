import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('documents the actual CLI input folders and preserves the ordered cutover gates', () => {
  const doc = readFileSync(new URL('../../docs/cutover-day-runsheet.md', import.meta.url), 'utf8');
  const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const [script, files] of [
    ['opening:check', ['1-start-date.csv', '2-name-decisions.csv', '3-customers-who-owe.csv', '4-customers-paid-in-advance.csv', '6-loans-and-owner-money.csv']],
    ['stock:check', ['materials.csv', 'rolls.csv']],
  ] as const) {
    const folder = scripts[script].split(' ').at(-1);
    const line = doc.split('\n').find(line => line.startsWith(`- \`migration-data/${folder}/\``));
    expect(line).toBeDefined();
    for (const file of files) expect(line).toContain(`\`${file}\``);
  }
  const history = doc.split('\n').find(line => line.startsWith('- `migration-data/sheet-export-YYYYMMDD/`'));
  for (const file of ['Sales.csv', '2-name-decisions.csv', 'ignore-payments.csv']) expect(history).toContain(`\`${file}\``);
  const preflight = doc.split('\n').find(line => line.startsWith('- [ ] `.env.local`'));
  for (const key of ['SUPABASE_MIGRATION_DATABASE_URL', 'SUPABASE_MIGRATION_PROJECT_REF', 'SUPABASE_ADMIN_STAFF_ID']) expect(preflight).toContain(key);
  expect(preflight).toContain('(once)');
  expect(preflight).toContain('no mode flags');
  const commands = doc.match(/```sh\n([\s\S]*?)```/g)?.find(block => block.includes('stock:diff')) ?? '';
  const ordered = ['stock:diff', 'stock:apply', 'opening:check', 'opening:post', 'history-check', 'history-import', 'history-verify', 'opening:verify', 'opening:activate'];
  expect(ordered.map(command => commands.indexOf(command))).toEqual(ordered.map(command => commands.indexOf(command)).sort((a, b) => a - b));
  expect(ordered.every(command => commands.includes(command))).toBe(true);
  expect(doc).toContain('sheet_row,payment,expected_amount_naira,reason');
});
