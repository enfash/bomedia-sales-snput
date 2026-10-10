// Test data for the sandbox only. Re-running keeps existing rows.
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { hashPin } from '../../lib/server/pin-credentials.mjs';
import { testConnection } from './cli.mjs';
import { loadSandboxEnv, root, sandboxFile } from './sandbox-env.mjs';

const env = await loadSandboxEnv();
const ref = env.SUPABASE_MIGRATION_PROJECT_REF;
const ca = await readFile(env.SUPABASE_CA_CERT_PATH, 'utf8');
const sql = postgres(testConnection(env.SUPABASE_MIGRATION_DATABASE_URL, ref, ref),
  { ssl: { rejectUnauthorized: true, ca }, max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
try {
  const owner = await sql.begin(async tx => {
    const staff = async (name, login, pin) => {
      const [row] = await tx`insert into bomedia.staff(display_name,login_name,pin_hash) values (${name},${login},${pin ? await hashPin(pin) : null})
        on conflict (login_name) do update set display_name=excluded.display_name returning id`;
      return row.id;
    };
    const ownerId = await staff('Owner (sandbox)', 'sandbox-owner', null);
    await staff('Ada (test cashier)', 'ada', '1234');
    await staff('Tunde (test cashier)', 'tunde', '5678');
    const [books] = await tx`select count(*)::int as n from bomedia.bookkeeping_settings`;
    if (!books.n) await tx`insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-01','active')`;
    for (const [name, contact] of [['Grace Chapel', '0803 000 0001'], ['Adeola Stores', '0805 000 0002']]) {
      await tx`insert into bomedia.customers(display_name,contact) select ${name},${contact} where not exists (select 1 from bomedia.customers where display_name=${name})`;
    }
    let openingValue = 0n;
    for (const [name, width, price, rollCost, rolls] of [['Flex', 10, 25000, 6000000, 2], ['SAV', 4, 30000, 4500000, 1]]) {
      let [mat] = await tx`select id from bomedia.materials where name=${name} and width_ft=${width}`;
      if (mat) continue;
      [mat] = await tx`insert into bomedia.materials(name,category,width_ft,selling_price_per_sqft_kobo,low_stock_threshold_ft) values (${name},${name},${width},${price},20) returning id`;
      for (let i = 1; i <= rolls; i++) {
        const [roll] = await tx`insert into bomedia.inventory_rolls(material_id,legacy_roll_id,item_name,category,width_ft,raw_length_ft,total_length_ft,remaining_length_ft,
            original_unit,purchase_cost_kobo,selling_price_kobo,waste_factor,low_stock_threshold_ft,status,business_date)
          values (${mat.id},${`${name} ${width}ft - Roll ${String(i).padStart(3,'0')}`},${name},${name},${width},164,154,154,'ft',${rollCost},${price},10,20,'Active','2026-10-01') returning id`;
        if (i === 1) await tx`update bomedia.materials set active_roll_id=${roll.id} where id=${mat.id}`;
        openingValue += BigInt(rollCost);
      }
    }
    if (openingValue > 0n) {
      await tx`select bomedia.post_journal(${'sandbox-opening-' + randomBytes(4).toString('hex')}, ${sql.json({ actor_id: ownerId, business_date: '2026-10-01', kind: 'adjustment',
        memo: 'Sandbox opening stock value', lines: [{ account_code: '1200', debit_kobo: openingValue.toString() }, { account_code: '3000', credit_kobo: openingValue.toString() }] })}::jsonb)`;
    }
    const [services] = await tx`select count(*)::int as n from bomedia.services`;
    if (!services.n) await tx`insert into bomedia.services(name,pricing,unit_price_kobo,created_by) values
      ('Graphic design','fixed',500000,${ownerId}),('Installation / fixing','per_job',null,${ownerId}),('Eyelets','fixed',5000,${ownerId})`;
    return ownerId;
  });
  // Bind the admin login to the sandbox owner record, in the sandbox file only.
  const path = join(root, sandboxFile), text = await readFile(path, 'utf8'), line = `SUPABASE_ADMIN_STAFF_ID=${owner}`;
  const updated = /^SUPABASE_ADMIN_STAFF_ID=.*$/m.test(text) ? text.replace(/^SUPABASE_ADMIN_STAFF_ID=.*$/m, line) : `${text.trimEnd()}\n${line}\n`;
  const temp = `${path}.seed-${randomBytes(6).toString('hex')}`;
  await writeFile(temp, updated, { mode: 0o600 }); await rename(temp, path); await chmod(path, 0o600);
  console.log(JSON.stringify({ seeded: true, testCashiers: ['ada (PIN 1234)', 'tunde (PIN 5678)'], ownerLinked: true }));
} finally { await sql.end({ timeout: 5 }); }
