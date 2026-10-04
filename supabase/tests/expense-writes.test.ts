import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase, insertId } from './helpers';
import { createExpenseService } from '../../lib/server/expense-service';
import type { FinancialCall } from '../../lib/server/financial-db';
let db: PGlite, actor: string;
const call: FinancialCall = async <T>(method: string,key: string,payload: Record<string,unknown>): Promise<T> =>
  (await db.query<{result:T}>(`select bomedia.${method}($1,$2::jsonb) as result`,[key,JSON.stringify(payload)])).rows[0].result;
const service=createExpenseService(call);
beforeAll(async()=>{db=await testDatabase();},30_000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('begin');
  actor=await insertId(db,"insert into bomedia.staff(display_name,login_name) values ('Logger','logger') returning id");
  await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')");
  await db.exec('set local role bomedia_financial_runtime');
});
afterEach(async()=>{await db.exec('rollback');});
const expense=(extra={})=>({requestId:'expense-1',businessDate:'2026-10-05',amountKobo:'250050',category:'Fuel',
  description:'Generator diesel',paidTo:'Filling station',status:'paid',paymentMethod:'transfer',...extra});
async function balances(entity: string) {
  await db.exec('reset role');
  const rows=(await db.query<{account_code:string;net:string}>(`select l.account_code,sum(l.debit_kobo-l.credit_kobo)::text as net
    from bomedia.journal_lines l join bomedia.journal_entries j on j.id=l.entry_id where j.source_id=$1 and j.status='posted'
    group by l.account_code order by l.account_code`,[entity])).rows;
  await db.exec('set local role bomedia_financial_runtime');
  return Object.fromEntries(rows.map(r=>[r.account_code,r.net]));
}
async function savepointFailure(work:()=>Promise<unknown>,match: object) {
  await db.exec('savepoint bad'); await expect(work()).rejects.toMatchObject(match); await db.exec('rollback to savepoint bad');
}
it('posts a paid expense against the chosen method account and replays exactly',async()=>{
  const result=await service.log({staffId:actor},expense());
  expect(result).toMatchObject({amount_kobo:'250050',status:'Paid'});
  expect(await service.log({staffId:actor},expense())).toEqual(result);
  expect(await balances(result.expense_id)).toEqual({'1010':'-250050','6000':'250050'});
  await savepointFailure(()=>service.log({staffId:actor},expense({amountKobo:'250051'})),{status:409});
});
it('accrues an unpaid expense, settles it once and leaves nothing awaiting payment',async()=>{
  const logged=await service.log({staffId:actor},expense({status:'unpaid',paymentMethod:undefined}));
  expect(logged.status).toBe('Unpaid');
  expect(await balances(logged.expense_id)).toEqual({'2010':'-250050','6000':'250050'});
  const pay={requestId:'pay-1',expenseId:logged.expense_id,businessDate:'2026-10-06',paymentMethod:'cash'};
  const paid=await service.pay({staffId:actor},pay);
  expect(await service.pay({staffId:actor},pay)).toEqual(paid);
  expect(await balances(logged.expense_id)).toEqual({'1000':'-250050','2010':'0','6000':'250050'});
  await savepointFailure(()=>service.pay({staffId:actor},{...pay,requestId:'pay-2'}),{status:409});
  await savepointFailure(()=>service.pay({staffId:actor},{...pay,requestId:'early',businessDate:'2026-10-04'}),{status:409});
});
it('refuses to pay legacy unpaid expenses that have no accrual in the books',async()=>{
  await db.exec('reset role');
  const legacy=await insertId(db,"insert into bomedia.expenses(amount_kobo,business_date,category,status) values (1000,'2026-09-30','Legacy','Unpaid') returning id");
  await db.exec('set local role bomedia_financial_runtime');
  await savepointFailure(()=>service.pay({staffId:actor},{requestId:'legacy',expenseId:legacy,businessDate:'2026-10-05',paymentMethod:'cash'}),{status:409});
});
it('rejects closed periods, dates before the books and disabled staff',async()=>{
  await savepointFailure(()=>service.log({staffId:actor},expense({requestId:'early',businessDate:'2026-10-04'})),{status:409});
  await db.exec("reset role; update bomedia.bookkeeping_settings set closed_through='2026-10-05'; set local role bomedia_financial_runtime");
  await savepointFailure(()=>service.log({staffId:actor},expense()),{status:409});
  await db.exec('reset role'); await db.query('update bomedia.staff set disabled_at=now() where id=$1',[actor]); await db.exec('set local role bomedia_financial_runtime');
  await savepointFailure(()=>service.log({staffId:actor},expense({businessDate:'2026-10-06'})),{status:403});
});
it('validates inputs before SQL and blocks spoofed identities',async()=>{
  for (const extra of [{amountKobo:'0'},{amountKobo:'12.5'},{amountKobo:2500},{actor_id:actor},{rowIndex:4},
    {status:'Paid'},{status:'unpaid'},{paymentMethod:'cheque'},{businessDate:'2026-02-30'},{category:' '}]) {
    await expect(service.log({staffId:actor},expense(extra))).rejects.toMatchObject({status:400});
  }
  await expect(service.log({staffId:actor},expense({expectedStaffId:'00000000-0000-4000-8000-000000000001'}))).rejects.toMatchObject({status:403});
  await expect(service.pay({staffId:actor},{requestId:'x',expenseId:'12',businessDate:'2026-10-05',paymentMethod:'cash'})).rejects.toMatchObject({status:400});
});
it('keeps the runtime role away from tables, journals and spoofed accrual',async()=>{
  for (const sql of ["insert into bomedia.expenses(amount_kobo,category,status) values (1,'x','Paid')",'select * from bomedia.expenses',
    "select bomedia.post_journal('bad','{}')"]) {
    await db.exec('savepoint bad'); await expect(db.query(sql)).rejects.toThrow(); await db.exec('rollback to savepoint bad');
  }
});
