import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertId, testDatabase } from './helpers';

type Size = { id: string; code: string; width_ft: string; remaining_ft: string; roll_count: number; low_stock_ft: string; notes: string | null; available: boolean; price_kobo: string };
type Group = { name: string; price_kobo: string | null; prices_differ: boolean; sizes: Size[] };
let db: PGlite, owner: string, customer: string, order: string;
const groups = async () => (await db.query<{ r: Group[] }>('select bomedia.api_materials_admin() as r')).rows[0].r;
let counter = 0;
const save = async (payload: Record<string, unknown>, requestId = `req-${++counter}`) =>
  (await db.query<{ r: Record<string, unknown> }>('select bomedia.api_material_save($1,$2::jsonb) as r', [requestId, JSON.stringify({ actor_id: owner, ...payload })])).rows[0].r;
const prices = async (name: string) => (await db.query<{ p: string }>(
  "select selling_price_per_sqft_kobo::text as p from bomedia.materials where bomedia.material_group(name)=bomedia.material_group($1) order by width_ft", [name])).rows.map(r => r.p);
const audit = async (action: string) => (await db.query<{ details: Record<string, unknown> }>('select details from bomedia.audit_events where action=$1', [action])).rows.map(r => r.details);
const material = (name: string, width: number, price: number) => insertId(db, 'insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values ($1,$2,$3) returning id', [name, width, price]);
async function failure(work: () => Promise<unknown>, match: object) {
  await db.exec('savepoint rejected'); await expect(work()).rejects.toMatchObject(match); await db.exec('rollback to savepoint rejected');
}
beforeAll(async () => { db = await testDatabase(); }, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  await db.exec('delete from bomedia.price_requests');
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  customer = await insertId(db, "insert into bomedia.customers(display_name) values ('Grace Chapel') returning id");
  order = await insertId(db, 'insert into bomedia.orders(customer_id) values ($1) returning id', [customer]);
});
afterEach(async () => { await db.exec('rollback'); });

it('groups sizes of one material ignoring case and spacing, and says when their prices differ', async () => {
  await material('Banner', 4, 20000); await material(' banner ', 6, 20000); await material('BANNER', 8, 22000); await material('Vinyl', 4, 30000);
  const all = await groups();
  const banner = all.find(g => g.name.toLowerCase().trim() === 'banner')!;
  expect(banner.sizes.map(s => s.width_ft)).toEqual(['4', '6', '8']);
  expect(banner).toMatchObject({ price_kobo: null, prices_differ: true });
  expect(all.find(g => g.name === 'Vinyl')).toMatchObject({ price_kobo: '30000', prices_differ: false });
});

it('reports stock per size from its rolls', async () => {
  const id = await material('Banner', 4, 20000);
  await db.query("insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft) values ($1,'Banner',4,100,60.5),($1,'Banner',4,50,0)", [id]);
  const size = (await groups()).find(g => g.name === 'Banner')!.sizes[0];
  expect(size).toMatchObject({ remaining_ft: '60.5', roll_count: 1, low_stock_ft: '20', available: true, price_kobo: '20000' });
});

it('sets one price for every size of the material and nothing else, auditing once and replaying safely', async () => {
  await material('Banner', 4, 20000); await material('Banner', 6, 20000); await material('Vinyl', 4, 30000);
  expect(await save({ action: 'set_price', name: '  BANNER ', price_kobo: '25000' }, 'price-1')).toEqual({ price_kobo: '25000', sizes_updated: 2 });
  expect(await save({ action: 'set_price', name: '  BANNER ', price_kobo: '25000' }, 'price-1')).toEqual({ price_kobo: '25000', sizes_updated: 2 });
  expect(await prices('Banner')).toEqual(['25000', '25000']);
  expect(await prices('Vinyl')).toEqual(['30000']);
  expect(await audit('material_price_changed')).toEqual([{ name: 'Banner', from: '20000', to: '25000' }]);
  await save({ action: 'set_price', name: 'Banner', price_kobo: '25000' });
  expect(await audit('material_price_changed')).toHaveLength(1);
});

it('resolves sizes that disagree by setting one price and records no "from" it cannot know', async () => {
  await material('Banner', 4, 20000); await material('Banner', 6, 27000);
  await save({ action: 'set_price', name: 'Banner', price_kobo: '24000' });
  expect(await prices('Banner')).toEqual(['24000', '24000']);
  expect(await audit('material_price_changed')).toEqual([{ name: 'Banner', to: '24000' }]);
});

it('ignores every other attempt to change a price, including the old post-sale copy from a roll', async () => {
  const id = await material('Banner', 4, 20000);
  await db.exec("update bomedia.materials set selling_price_per_sqft_kobo = 99999");
  await db.query('update bomedia.materials set selling_price_per_sqft_kobo = $2 where id = $1', [id, 12345]);
  expect(await prices('Banner')).toEqual(['20000']);
  await db.exec("update bomedia.materials set low_stock_threshold_ft = 33");
  expect((await groups())[0].sizes[0].low_stock_ft).toBe('33');
  await save({ action: 'set_price', name: 'Banner', price_kobo: '21000' });
  await db.exec("update bomedia.materials set selling_price_per_sqft_kobo = 1");
  expect(await prices('Banner')).toEqual(['21000']);
});

it('refuses bad prices, unknown materials and extra fields', async () => {
  await material('Banner', 4, 20000);
  for (const price of ['0', '-5', '12.5', 'abc', '10000001', '']) await failure(() => save({ action: 'set_price', name: 'Banner', price_kobo: price }), { code: '22023' });
  await failure(() => save({ action: 'set_price', name: 'Ghost', price_kobo: '100' }), { code: '22023' });
  await failure(() => save({ action: 'set_price', name: 'Banner', price_kobo: 100, extra: 1 }), { code: '22023' });
  await failure(() => save({ action: 'set_price', name: 'Banner' }), { code: '22023' });
  await failure(() => save({ action: 'melt' }), { code: '22023' });
  await failure(() => save({ action: 'set_price', name: 'Banner', price_kobo: '100' }, 'x').then(() => db.query("select bomedia.api_material_save('y',$1::jsonb)", [JSON.stringify({ actor_id: owner, action: 'bogus' })])), { code: '22023' });
});

it('needs an enabled staff member', async () => {
  await material('Banner', 4, 20000);
  await db.exec('update bomedia.staff set disabled_at = now()');
  await failure(() => save({ action: 'set_price', name: 'Banner', price_kobo: '21000' }), { code: '42501' });
});

it('adds a material with a code that never changes, and refuses a name that exists', async () => {
  const added = await save({ action: 'add_material', name: ' Mesh  Banner ', price_kobo: '28000', width_ft: '6', low_stock_ft: '15', notes: ' for events ' });
  expect(added).toMatchObject({ code: 'MESH-BANNER-6FT' });
  const mesh = (await groups()).find(g => g.name === 'Mesh Banner')!;
  expect(mesh).toMatchObject({ price_kobo: '28000' });
  expect(mesh.sizes[0]).toMatchObject({ width_ft: '6', low_stock_ft: '15', notes: 'for events', code: 'MESH-BANNER-6FT', available: true });
  await failure(() => save({ action: 'add_material', name: 'mesh banner', price_kobo: '100', width_ft: '4' }), { code: '22023' });
  expect(await audit('material_added')).toEqual([{ name: 'Mesh Banner', to: '28000' }]);
  for (const width of ['0', '101', 'x', '1.2345']) await failure(() => save({ action: 'add_material', name: 'Other', price_kobo: '100', width_ft: width }), { code: '22023' });
});

it('adds a size that inherits the one price, and refuses a repeated width or a material whose prices differ', async () => {
  await material('Banner', 4, 20000);
  const added = await save({ action: 'add_size', name: 'banner', width_ft: '6' });
  expect(added).toMatchObject({ code: 'BANNER-6FT' });
  expect(await prices('Banner')).toEqual(['20000', '20000']);
  expect((await groups())[0].sizes.map(s => s.low_stock_ft)).toEqual(['20', '20']);
  await failure(() => save({ action: 'add_size', name: 'Banner', width_ft: '6.0' }), { code: '22023' });
  await failure(() => save({ action: 'add_size', name: 'Ghost', width_ft: '6' }), { code: '22023' });
  await material('Vinyl', 4, 1000); await material('Vinyl', 6, 2000);
  await failure(() => save({ action: 'add_size', name: 'Vinyl', width_ft: '8' }), { code: '23514' });
  expect(await audit('material_size_added')).toEqual([{ name: 'Banner 6 ft' }]);
});

it('renames every size and its rolls without changing codes, and refuses a name that is taken', async () => {
  const flex = await material('Banner', 4, 20000); // no stored code: it is derived from the name until the name changes
  await save({ action: 'add_size', name: 'Banner', width_ft: '6' });
  await db.query("insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft) values ($1,'Banner',4,100,50)", [flex]);
  await material('Vinyl', 4, 30000);
  expect(await save({ action: 'rename', name: 'banner', new_name: ' Flex  Banner ' })).toEqual({ name: 'Flex Banner', sizes_updated: 2 });
  const renamed = (await groups()).find(g => g.name === 'Flex Banner')!;
  expect(renamed.sizes.map(s => s.code)).toEqual(['BANNER-4FT', 'BANNER-6FT']);
  expect((await db.query<{ item_name: string }>('select item_name from bomedia.inventory_rolls')).rows).toEqual([{ item_name: 'Flex Banner' }]);
  await failure(() => save({ action: 'rename', name: 'Flex Banner', new_name: 'VINYL' }), { code: '22023' });
  await failure(() => save({ action: 'rename', name: 'Flex Banner', new_name: ' ' }), { code: '22023' });
  expect(await save({ action: 'rename', name: 'Flex Banner', new_name: 'flex banner' })).toMatchObject({ sizes_updated: 2 });
  expect((await audit('material_renamed')).map(d => `${d.from} > ${d.to}`).sort()).toEqual(['Banner > Flex Banner', 'Flex Banner > flex banner']);
});

it('changes a size low-stock level, notes and availability, auditing only real changes', async () => {
  const id = await material('Banner', 4, 20000);
  expect(await save({ action: 'update_size', material_id: id, low_stock_ft: '35', notes: 'Fragile', available: false })).toMatchObject({ changed: ['low_stock', 'notes'], availability_changed: true });
  const size = (await groups())[0].sizes[0];
  expect(size).toMatchObject({ low_stock_ft: '35', notes: 'Fragile', available: false });
  await save({ action: 'update_size', material_id: id, low_stock_ft: '35', notes: 'Fragile', available: false });
  expect((await audit('material_size_saved')).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
    { name: 'Banner 4 ft', changed: ['low_stock', 'notes'] }, { name: 'Banner 4 ft', enabled: false }]);
  await failure(() => save({ action: 'update_size', material_id: id, available: 'no' }), { code: '22023' });
  await failure(() => save({ action: 'update_size', material_id: '00000000-0000-4000-8000-000000000000' }), { code: '22023' });
  await failure(() => save({ action: 'update_size' }), { code: '22023' });
});

it('refuses new sales, price requests and saved quotes on a turned-off size, and allows them again when turned on', async () => {
  const id = await material('Banner', 4, 20000);
  const job = () => db.query(`insert into bomedia.jobs(order_id,customer_id,material_id,description,quantity,unit_price_kobo,amount_kobo,job_status)
    values ($1,$2,$3,'Test',1,100,100,'Pending')`, [order, customer, id]);
  const quote = () => db.query("insert into bomedia.estimates(customer_id,cart_data) values ($1,$2::jsonb)", [customer, JSON.stringify({ items: [{ material_id: id }] })]);
  await job(); await quote();
  await save({ action: 'update_size', material_id: id, available: false });
  await failure(job, { code: '22023', message: expect.stringContaining('turned off') });
  await failure(quote, { code: '22023', message: expect.stringContaining('turned off') });
  expect((await db.query('select count(*)::int as n from bomedia.jobs')).rows[0]).toEqual({ n: 1 });
  await save({ action: 'update_size', material_id: id, available: true });
  await job(); await quote();
  expect((await db.query('select count(*)::int as n from bomedia.jobs')).rows[0]).toEqual({ n: 2 });
});

it('lists turned-off sizes by id and code for the feeds', async () => {
  const id = await material('Banner', 4, 20000); await material('Vinyl', 4, 30000);
  expect((await db.query<{ r: unknown[] }>('select bomedia.api_unavailable_materials() as r')).rows[0].r).toEqual([]);
  await save({ action: 'update_size', material_id: id, available: false });
  expect((await db.query<{ r: unknown[] }>('select bomedia.api_unavailable_materials() as r')).rows[0].r).toEqual([{ id, code: 'BANNER-4FT' }]);
});

it('files every material action under Settings in the audit log', async () => {
  for (const action of ['material_price_changed', 'material_renamed', 'material_added', 'material_size_added', 'material_size_saved', 'books_closed'])
    expect((await db.query<{ c: string }>('select bomedia.audit_category($1) as c', [action])).rows[0].c).toBe('settings');
});

it('runs for the accounting runtime only', async () => {
  await material('Banner', 4, 20000);
  await db.exec('set local role bomedia_financial_runtime');
  expect(await groups()).toHaveLength(1);
  expect(await save({ action: 'set_price', name: 'Banner', price_kobo: '21000' })).toMatchObject({ price_kobo: '21000' });
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated', 'service_role', 'bomedia_auth_runtime']) {
    const result = await db.query<{ ok: boolean }>(`select has_function_privilege($1,'bomedia.api_materials_admin()','EXECUTE')
      or has_function_privilege($1,'bomedia.api_material_save(text,jsonb)','EXECUTE') or has_function_privilege($1,'bomedia.api_unavailable_materials()','EXECUTE') as ok`, [role]);
    expect(result.rows[0].ok).toBe(false);
  }
});

it('never changes a code when a material is renamed, whether it was stored or derived, and by any route', async () => {
  const derived = await material('Banner', 4, 20000), stored = await material('Vinyl', 4, 30000);
  await db.query("update bomedia.materials set legacy_material_id='VINYL-OLD-4FT' where id=$1", [stored]);
  await db.query("update bomedia.materials set name='Mesh Banner' where id=$1", [derived]);
  await save({ action: 'rename', name: 'Vinyl', new_name: 'Vinyl Pro' });
  const codes = (await db.query<{ code: string }>('select bomedia.material_code(legacy_material_id,name,width_ft) as code from bomedia.materials order by name')).rows.map(r => r.code);
  expect(codes).toEqual(['BANNER-4FT', 'VINYL-OLD-4FT']);
  await db.query("update bomedia.materials set name='Mesh Banner Pro' where id=$1", [derived]);
  expect((await db.query<{ legacy_material_id: string }>('select legacy_material_id from bomedia.materials where id=$1', [derived])).rows[0].legacy_material_id).toBe('BANNER-4FT');
});
