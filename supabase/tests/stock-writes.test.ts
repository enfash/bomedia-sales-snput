import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase, insertId } from './helpers';
import { createStockService } from '../../lib/server/stock-service';
import type { FinancialCall } from '../../lib/server/financial-db';
let db: PGlite, actor: string, material: string;
const call: FinancialCall = async <T>(method: string,key: string,payload: Record<string,unknown>): Promise<T> =>
  (await db.query<{result:T}>(`select bomedia.${method}($1,$2::jsonb) as result`,[key,JSON.stringify(payload)])).rows[0].result;
const stock=createStockService(call);
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  actor=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Owner','owner') returning id");
  material=await insertId(db,"insert into bomedia.materials(name,category,width_ft,selling_price_per_sqft_kobo,low_stock_threshold_ft) values ('SAV','SAV',5,25000,20) returning id");
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')");
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});
const restock=(extra={})=>({requestId:'restock-1',materialId:material,rollCount:'2',rawLengthFt:'164',totalCostKobo:'1000001',
  paymentMethod:'transfer',businessDate:'2026-10-05',supplier:'Supplier',reference:'INV-1',...extra});
async function owner<T>(work:()=>Promise<T>):Promise<T> {
  await db.exec('reset role');try {return await work();} finally {await db.exec('set local role bomedia_financial_runtime');}
}
const ledger=()=>owner(async()=>Object.fromEntries((await db.query<{code:string;net:string}>(`select l.account_code as code,sum(l.debit_kobo-l.credit_kobo)::text as net
  from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id where e.status='posted' group by 1 order by 1`)).rows.map(r=>[r.code,r.net])));
const rolls=()=>owner(async()=>(await db.query<{id:string;legacy_roll_id:string;remaining:string;waste:string;cost:string;status:string}>(
  `select id,legacy_roll_id,remaining_length_ft::text as remaining,waste_length_ft::text as waste,purchase_cost_kobo::text as cost,status
   from bomedia.inventory_rolls order by legacy_roll_id`)).rows);
async function refused(work:()=>Promise<unknown>,match:object) {
  await db.exec('savepoint bad');await expect(work()).rejects.toMatchObject(match);await db.exec('rollback to savepoint bad');
}
it('restocks whole rolls with the setup reserve, an exact cost split and one balanced journal',async()=>{
  const result=await stock.restock({staffId:actor},restock());
  expect(result).toMatchObject({usable_length_ft:'308',total_cost_kobo:'1000001'});
  expect(await stock.restock({staffId:actor},restock())).toEqual(result);
  expect((await rolls()).map(r=>[r.legacy_roll_id,r.remaining,r.cost,r.status])).toEqual([
    ['SAV 5ft - Roll 001','154.000000','500001','Active'],['SAV 5ft - Roll 002','154.000000','500000','Active']]);
  expect(await ledger()).toEqual({'1010':'-1000001','1200':'1000001'});
  await stock.restock({staffId:actor},restock({requestId:'restock-2',rollCount:'1',totalCostKobo:'400000'}));
  expect((await rolls()).map(r=>r.legacy_roll_id)).toContain('SAV 5ft - Roll 003');
  await refused(()=>stock.restock({staffId:actor},restock({totalCostKobo:'1000002'})),{status:409});
});
it('writes waste and count corrections off at roll cost so a used-up roll costs exactly its price',async()=>{
  await stock.restock({staffId:actor},restock());
  const [first]=await rolls();
  const waste=await stock.waste({staffId:actor},{requestId:'waste-1',rollId:first.id,lengthFt:'4.5',reason:'Misprint',responsible:'Ada',businessDate:'2026-10-05'});
  expect(waste.remaining_length_ft).toBe('149.500000');
  const wasted=BigInt(String(waste.value_change_kobo));
  expect(wasted).toBe(BigInt(Math.round(149.5/154*500001)-500001));
  await refused(()=>stock.waste({staffId:actor},{requestId:'waste-big',rollId:first.id,lengthFt:'150',reason:'Too much',businessDate:'2026-10-05'}),{status:409});
  await refused(()=>stock.count({staffId:actor},{requestId:'same',rollId:first.id,countedLengthFt:'149.5',reason:'No change',businessDate:'2026-10-05'}),{status:409});
  await refused(()=>stock.count({staffId:actor},{requestId:'over',rollId:first.id,countedLengthFt:'154.5',reason:'Too long',businessDate:'2026-10-05'}),{status:409});
  await stock.count({staffId:actor},{requestId:'count-down',rollId:first.id,countedLengthFt:'0',reason:'Roll found finished',businessDate:'2026-10-06'});
  expect((await rolls())[0]).toMatchObject({remaining:'0.000000',status:'Out of Stock',waste:'4.500000'});
  await refused(()=>stock.waste({staffId:actor},{requestId:'waste-empty',rollId:first.id,lengthFt:'1',reason:'Empty',businessDate:'2026-10-06'}),{status:409});
  expect(await ledger()).toEqual({'1010':'-1000001','1200':'500000','5100':'500001'});
  await stock.count({staffId:actor},{requestId:'count-up',rollId:first.id,countedLengthFt:'10',reason:'Found a part roll',businessDate:'2026-10-06'});
  expect((await rolls())[0]).toMatchObject({remaining:'10.000000',status:'Low Stock'});
  expect((await ledger())['5100']).toBe(String(500001-Math.round(10/154*500001)));
});
it('refuses waste on stock whose value is not yet in the books, closed periods and disabled staff',async()=>{
  const legacy=await owner(()=>insertId(db,"insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo) values ($1,'SAV',5,100,100,200000) returning id",[material]));
  await refused(()=>stock.waste({staffId:actor},{requestId:'legacy',rollId:legacy,lengthFt:'1',reason:'Test',businessDate:'2026-10-05'}),{status:409});
  await refused(()=>stock.restock({staffId:actor},restock({businessDate:'2026-10-04'})),{status:409});
  await owner(()=>db.query('update bomedia.staff set disabled_at=now() where id=$1',[actor]));
  await refused(()=>stock.restock({staffId:actor},restock()),{status:403});
});
it('validates input before SQL and keeps helpers private',async()=>{
  for (const extra of [{rawLengthFt:'10'},{rollCount:'0'},{rollCount:2},{totalCostKobo:'12.5'},{totalCostKobo:'1'},{paymentMethod:'credit'},{actor_id:actor},{rowIndex:3}]) {
    await expect(stock.restock({staffId:actor},restock(extra))).rejects.toMatchObject({status:400});
  }
  await expect(stock.waste({staffId:actor},{requestId:'x',rollId:'row-4',lengthFt:'1',reason:'x',businessDate:'2026-10-05'})).rejects.toMatchObject({status:400});
  await expect(stock.count({staffId:actor},{requestId:'x',rollId:material,countedLengthFt:'1',reason:'no',businessDate:'2026-10-05'})).rejects.toMatchObject({status:400});
  for (const sql of ["select bomedia.lock_active_books()","update bomedia.inventory_rolls set remaining_length_ft=0","select bomedia.check_business_date('2026-10-05')"]) {
    await db.exec('savepoint bad');await expect(db.query(sql)).rejects.toThrow();await db.exec('rollback to savepoint bad');
  }
});
