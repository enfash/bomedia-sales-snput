import type { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { testDatabase, insertId } from './helpers';
import { activateOpening, buildOpeningPlan, postOpening, verifyOpening } from '../../scripts/migration/opening-balances.mjs';
import { applyStock, buildStockPlan, diffStock, summarizeStock } from '../../scripts/migration/stock-opening.mjs';

const MATERIAL_HEADER = 'material_id,name,width_ft,selling_price_naira_per_sqft,low_stock_threshold_ft\n';
const ROLL_HEADER = 'roll_id,material_id,item_name,width_ft,raw_length_ft,total_length_ft,remaining_ft,purchase_cost_naira,selling_price_naira,date_added,note\n';
const MATERIALS = MATERIAL_HEADER + 'MAT-FLEX,Flex,5,300,30\nMAT-VINYL,Vinyl,4,500,20\n';
const ROLLS = ROLL_HEADER + 'ROLL-1,MAT-FLEX,Flex Roll 1,5,110,100,80,50000,,2026-09-01,counted\nROLL-2,MAT-VINYL,Vinyl Roll 1,4,60,50,50,20000,,2026-10-12,new roll\n';
const DATE = '2026-10-18';
const stockFiles = (over: Record<string, string> = {}) => ({ materials: MATERIALS, rolls: ROLLS, ...over });

const OPENING = {
  startDate: 'item,value,note\nopening_date,2026-10-18,\n',
  owing: 'customer_name,phone,amount_owed_naira,sale_date,job_description,sales_id,sheet_row\nKay,,5000,2026-09-01,Banner,BOM-K1,2\n',
  credits: 'customer_name,phone,amount_in_credit_naira,date_paid,reason,evidence,note\n',
  loans: 'who,type,amount_naira,date,evidence,note\n',
};

let db: PGlite, owner: string;
afterEach(async () => { await db?.close(); });
/** The database as the 4 October import left it: one material and one roll, with the old length and price. */
async function imported() {
  db = await testDatabase();
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values('Owner','owner') returning id");
  const material = await insertId(db, "insert into bomedia.materials(legacy_material_id,name,width_ft,selling_price_per_sqft_kobo,low_stock_threshold_ft) values('MAT-FLEX','Flex',5,25000,20) returning id");
  const roll = await insertId(db, `insert into bomedia.inventory_rolls(material_id,legacy_roll_id,item_name,width_ft,raw_length_ft,total_length_ft,remaining_length_ft,original_unit,purchase_cost_kobo,low_stock_threshold_ft,status)
    values($1,'ROLL-1','Flex Roll 1',5,110,100,100,'ft',5000000,20,'Active') returning id`, [material]);
  await db.query('update bomedia.materials set active_roll_id=$1 where id=$2', [roll, material]);
  await db.query("insert into bomedia.inventory_movements(roll_id,kind,length_delta_ft,reason,business_date) values($1,'opening',100,'Opening stock 2026-10-04','2026-10-04')", [roll]);
}
const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, string>>(sql, params)).rows;

describe('stock files', () => {
  it('turns the two files into an exact plan and refuses unclear rows', () => {
    const plan = buildStockPlan(stockFiles(), DATE);
    expect(plan.materials).toHaveLength(2);
    expect(plan.rolls.find((r: { id: string }) => r.id === 'ROLL-1')).toMatchObject({ remainingFt: '80.000000', costKobo: '5000000' });
    const bad = (rolls: string) => () => buildStockPlan(stockFiles({ rolls: ROLL_HEADER + rolls }), DATE);
    expect(bad('R1,MAT-FLEX,x,5,10,100,101,500,,,\n')).toThrow(/more than total_length_ft/);
    expect(bad('R1,MAT-FLEX,x,5,10,100,50,0,,,\n')).toThrow(/purchase_cost_naira must be more than zero/);
    expect(bad('R1,MAT-NOPE,x,5,10,100,50,500,,,\n')).toThrow(/not in materials.csv/);
    expect(bad('R1,MAT-FLEX,x,5,10,100,abc,500,,,\n')).toThrow(/at most six decimals/);
    expect(bad('R1,MAT-FLEX,x,5,10,100,50,500,,,\nR1,MAT-FLEX,x,5,10,100,50,500,,,\n')).toThrow(/appears twice/);
    expect(() => buildStockPlan(stockFiles(), '18/10/2026')).toThrow(/YYYY-MM-DD/);
  });
});

describe('opening stock', () => {
  it('blocks an unlisted native roll, includes its value when explicitly allowed, and binds posting to the approved stock set', async () => {
    await imported();
    await db.query(`insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo)
      select id,'Native roll',5,100,100,1000000 from bomedia.materials where legacy_material_id='MAT-FLEX'`);
    const stock = buildStockPlan(stockFiles(), DATE);
    expect((await diffStock(db, stock)).blocked.join()).toMatch(/not counted|not in rolls.csv/);
    await expect(applyStock(db, stock, { actorId: owner })).rejects.toThrow(/Blocked/);
    const allowed = await diffStock(db, stock, { allowUncounted: true });
    expect(summarizeStock(stock, allowed)).toMatchObject({ countedStockValue: '₦70,000.00', rollsNotInFile: 1, blockers: [] });
    await expect(postOpening(db, buildOpeningPlan(OPENING), { actorId: owner })).rejects.toThrow(/approved count/);
    await applyStock(db, stock, { actorId: owner, allowUncounted: true });
    const approved = buildOpeningPlan(OPENING);
    await postOpening(db, approved, { actorId: owner });
    expect((await verifyOpening(db, approved)).ok).toBe(true);
    // Preserve the value (50/50 of half the original cost), but change the approved cost/lengths.
    await db.exec("update bomedia.inventory_rolls set total_length_ft=50,remaining_length_ft=50 where legacy_roll_id is null");
    const report = await verifyOpening(db, approved);
    expect(report.checks.find((c: { name: string }) => c.name === 'inventory equals the counted stock valued at cost').ok).toBe(true);
    expect(report.checks.find((c: { name: string }) => c.name === 'counted stock matches the approved fingerprint').ok).toBe(false);
    await expect(activateOpening(db, approved)).rejects.toThrow(/fingerprint/);
  });

  it('zero-unlisted includes rolls without a legacy ID and records their adjustments once', async () => {
    await imported();
    await db.query(`insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo)
      select id,'Native roll',5,100,100,1000000 from bomedia.materials where legacy_material_id='MAT-FLEX'`);
    const stock = buildStockPlan(stockFiles(), DATE);
    await applyStock(db, stock, { actorId: owner, zeroUnlisted: true });
    await applyStock(db, stock, { actorId: owner, zeroUnlisted: true });
    expect((await rows('select remaining_length_ft::text r from bomedia.inventory_rolls where legacy_roll_id is null'))[0].r).toBe('0.000000');
    expect((await rows("select count(*)::text n from bomedia.audit_events where action='opening_stock_approved'"))[0].n).toBe('1');
  });

  it('blocks a roll whose width differs from the file, and notices a selling price changed after approval', async () => {
    await imported();
    const width = buildStockPlan(stockFiles({ rolls: ROLLS.replace('ROLL-1,MAT-FLEX,Flex Roll 1,5,', 'ROLL-1,MAT-FLEX,Flex Roll 1,3,') }), DATE);
    expect((await diffStock(db, width)).blocked.join()).toMatch(/width is/);
    await applyStock(db, buildStockPlan(stockFiles(), DATE), { actorId: owner });
    await db.query("select set_config('bomedia.material_price_edit','on',false)");
    await db.exec("update bomedia.materials set selling_price_per_sqft_kobo=50000 where legacy_material_id='MAT-FLEX'");
    await expect(postOpening(db, buildOpeningPlan(OPENING), { actorId: owner })).rejects.toThrow(/approved count/);
    expect((await rows('select count(*)::text n from bomedia.journal_entries'))[0].n).toBe('0');
  });

  it('refuses stock changed after its approval before posting', async () => {
    await imported();
    await applyStock(db, buildStockPlan(stockFiles(), DATE), { actorId: owner });
    await db.exec("update bomedia.inventory_rolls set remaining_length_ft=79 where legacy_roll_id='ROLL-1'");
    await expect(postOpening(db, buildOpeningPlan(OPENING), { actorId: owner })).rejects.toThrow(/approved count/);
    expect((await rows('select count(*)::text n from bomedia.journal_entries'))[0].n).toBe('0');
  });

  it('shows what would change, applies prices, the count and a new roll, and a second run changes nothing', async () => {
    await imported();
    const plan = buildStockPlan(stockFiles(), DATE);
    const before = await diffStock(db, plan);
    expect(summarizeStock(plan, before)).toMatchObject({ newMaterials: 1, materialsWithNewPriceOrThreshold: 1, newRolls: 1, rollsRecounted: 1, countedStockValue: '₦60,000.00', blockers: [] });
    await applyStock(db, plan, { actorId: owner });
    expect(await rows("select selling_price_per_sqft_kobo::text p, low_stock_threshold_ft::text t from bomedia.materials where legacy_material_id='MAT-FLEX'")).toEqual([{ p: '30000', t: '30.000000' }]);
    expect(await rows("select remaining_length_ft::text r, status from bomedia.inventory_rolls where legacy_roll_id='ROLL-1'")).toEqual([{ r: '80.000000', status: 'Active' }]);
    expect(await rows("select kind, length_delta_ft::text d, reason from bomedia.inventory_movements m join bomedia.inventory_rolls r on r.id=m.roll_id where r.legacy_roll_id='ROLL-1' and kind='adjustment'"))
      .toEqual([{ kind: 'adjustment', d: '-20.000000', reason: 'Opening count 2026-10-18 - counted' }]);
    expect(await rows("select m.kind, m.length_delta_ft::text d, r.remaining_length_ft::text rem, r.purchase_cost_kobo::text c from bomedia.inventory_movements m join bomedia.inventory_rolls r on r.id=m.roll_id where r.legacy_roll_id='ROLL-2'"))
      .toEqual([{ kind: 'opening', d: '50.000000', rem: '50.000000', c: '2000000' }]);
    expect((await rows("select count(*)::text n from bomedia.materials where legacy_material_id='MAT-VINYL' and active_roll_id is not null"))[0].n).toBe('1');
    // Nothing is posted to the books by this step.
    expect((await rows('select count(*)::text n from bomedia.journal_entries'))[0].n).toBe('0');
    const again = await diffStock(db, plan);
    expect(summarizeStock(plan, again)).toMatchObject({ newMaterials: 0, materialsWithNewPriceOrThreshold: 0, newRolls: 0, rollsRecounted: 0, rollsAlreadyMatching: 2 });
    await applyStock(db, plan, { actorId: owner });
    expect((await rows("select count(*)::text n from bomedia.inventory_movements where kind='adjustment'"))[0].n).toBe('1');
  });

  it('blocks when a roll differs in length or cost, or when stock in the database was not counted', async () => {
    await imported();
    const cost = buildStockPlan(stockFiles({ rolls: ROLLS.replace('50000', '55000') }), DATE);
    expect((await diffStock(db, cost)).blocked.join()).toMatch(/purchase cost/);
    const length = buildStockPlan(stockFiles({ rolls: ROLLS.replace(',100,80,', ',120,80,') }), DATE);
    expect((await diffStock(db, length)).blocked.join()).toMatch(/total length/);
    const missing = buildStockPlan(stockFiles({ rolls: ROLL_HEADER + 'ROLL-2,MAT-VINYL,Vinyl Roll 1,4,60,50,50,20000,,,\n' }), DATE);
    expect((await diffStock(db, missing)).blocked.join()).toMatch(/not counted|not in rolls.csv/);
    await expect(applyStock(db, missing, { actorId: owner })).rejects.toThrow(/nothing was changed/i);
    expect((await diffStock(db, missing, { allowUncounted: true })).blocked).toEqual([]);
    expect((await rows("select remaining_length_ft::text r from bomedia.inventory_rolls where legacy_roll_id='ROLL-1'"))[0].r).toBe('100.000000');
  });

  it('sets every roll the owner did not list to zero when asked, as a recorded count, and otherwise blocks', async () => {
    await imported();
    await db.query(`insert into bomedia.inventory_rolls(material_id,legacy_roll_id,item_name,width_ft,raw_length_ft,total_length_ft,remaining_length_ft,original_unit,purchase_cost_kobo,low_stock_threshold_ft,status)
      select id,'ROLL-OLD','Flex Roll 0',5,110,100,40,'ft',5000000,20,'Active' from bomedia.materials where legacy_material_id='MAT-FLEX'`);
    const plan = buildStockPlan(stockFiles({ rolls: ROLL_HEADER + 'ROLL-2,MAT-VINYL,Vinyl Roll 1,4,60,50,50,20000,,,\n' }), DATE);
    expect((await diffStock(db, plan)).blocked.length).toBeGreaterThan(0);
    const diff = await diffStock(db, plan, { zeroUnlisted: true });
    expect(diff.blocked).toEqual([]);
    expect(summarizeStock(plan, diff)).toMatchObject({ ofWhichSetToZeroBecauseNotListed: 2, countedStockValue: '₦20,000.00' });
    await applyStock(db, plan, { actorId: owner, zeroUnlisted: true });
    expect(await rows("select legacy_roll_id, remaining_length_ft::text r, status from bomedia.inventory_rolls order by legacy_roll_id")).toEqual([
      { legacy_roll_id: 'ROLL-1', r: '0.000000', status: 'Out of Stock' }, { legacy_roll_id: 'ROLL-2', r: '50.000000', status: 'Active' }, { legacy_roll_id: 'ROLL-OLD', r: '0.000000', status: 'Out of Stock' }]);
    expect((await rows("select reason from bomedia.inventory_movements where kind='adjustment' order by length_delta_ft limit 1"))[0].reason).toBe('Opening count 2026-10-18 - none found at the count');
  });

  it('will not change stock once an opening entry or a runtime write exists', async () => {
    await imported();
    const plan = buildStockPlan(stockFiles(), DATE);
    await applyStock(db, plan, { actorId: owner });
    await postOpening(db, buildOpeningPlan(OPENING), { actorId: owner });
    await expect(applyStock(db, plan, { actorId: owner })).rejects.toThrow(/Journal entries already exist|books are already active/);
  });
});

describe('opening stock value and the first sale', () => {
  const sale = (customer: string, material: string, price = '120000') => db.query("select bomedia.api_sale('first-sale',$1::jsonb)", [JSON.stringify({ actor_id: owner, customer_id: customer, business_date: '2026-10-19',
    jobs: [{ material_id: material, description: 'Banner', quantity: '1', width_ft: '2', height_ft: '2', expected_unit_price_kobo: price }] })]);

  it('values the counted stock as Inventory and starts the books, and then the first sale goes through', async () => {
    await imported();
    await applyStock(db, buildStockPlan(stockFiles(), DATE), { actorId: owner });
    const plan = buildOpeningPlan(OPENING);
    const posted = await postOpening(db, plan, { actorId: owner });
    expect(posted).toMatchObject({ stockValue: '₦60,000.00', stockRolls: 2 });
    const net = async (code: string) => Number((await rows("select coalesce(sum(l.debit_kobo-l.credit_kobo),0)::text n from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id where e.status='posted' and l.account_code=$1", [code]))[0].n);
    expect(await net('1200')).toBe(6000000);
    expect(await net('1100')).toBe(500000);
    expect(await net('3000')).toBe(-(500000 + 6000000));
    const report = await verifyOpening(db, plan);
    expect(report.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
    await activateOpening(db, plan);
    const customer = await insertId(db, "insert into bomedia.customers(display_name) values('Walk-in') returning id");
    const material = (await rows("select id from bomedia.materials where legacy_material_id='MAT-FLEX'"))[0].id;
    await expect(sale(customer, material)).resolves.toBeTruthy();
    // The cost of the 2 ft used came out of the Inventory value that was posted.
    expect(await net('1200')).toBeLessThan(6000000);
  });

  it('would have refused every sale without that value (the problem this step fixes)', async () => {
    await imported();
    // Books started with only the debts: no Inventory value, as the first version of the opening command did.
    await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values('2026-10-19','setup')");
    await db.query("select bomedia.post_journal('only-debts',$1::jsonb)", [JSON.stringify({ actor_id: owner, business_date: '2026-10-18', kind: 'opening', memo: 'Debts only', opening_confirmed: true, evidence_reference: 'test',
      lines: [{ account_code: '1000', debit_kobo: '100' }, { account_code: '3000', credit_kobo: '100' }] })]);
    await db.exec("update bomedia.bookkeeping_settings set state='active'");
    const customer = await insertId(db, "insert into bomedia.customers(display_name) values('Walk-in') returning id");
    const material = (await rows("select id from bomedia.materials where legacy_material_id='MAT-FLEX'"))[0].id;
    await expect(sale(customer, material, '100000')).rejects.toThrow(/Inventory accounting value needs reconciliation/);
  });
});
