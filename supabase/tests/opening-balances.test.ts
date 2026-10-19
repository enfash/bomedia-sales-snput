import type { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { testDatabase, insertId } from './helpers';
import { activateOpening, buildOpeningPlan, createOwner, formatKobo, nairaToKobo, parseCsv, postOpening, summarizeOpening, verifyOpening } from '../../scripts/migration/opening-balances.mjs';

const START = 'item,value,note\nopening_date,2026-10-18,"last day before the books start"\nopening_time,18:00,\n';
const OWING_HEADER = 'customer_name,phone,amount_owed_naira,sale_date,job_description,sheet_row_or_receipt,note\n';
const OWING = OWING_HEADER
  + 'ade ogo,08011111111,"8,000",2026-09-03,"Flex banner, 10ft",BOM-A1,\n'
  + 'Ade  Ogo,,7000,2026-10-10,Sticker,BOM-A2,\n'
  + 'Grace,,2500.50,2026-10-12,Poster,BOM-G1,\n';
const CREDITS = 'customer_name,phone,amount_in_credit_naira,date_paid,reason,evidence,note\n';
const LOANS = 'who,type,amount_naira,date,evidence,note\n,"loan you owe / loan owed to you / owner capital",,,\neasemoni,loan you owe,"670,000",2026-06-30,"Sheet Expenses tab, 30 Jun",\n';
const files = (over: Record<string, string> = {}) => ({ startDate: START, owing: OWING, credits: CREDITS, loans: LOANS, ...over });

describe('opening balance planning', () => {
  it('reads quoted CSV fields, commas inside quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
    expect(() => parseCsv('a\n"open')).toThrow(/unclosed/);
  });

  it('turns naira into exact kobo and refuses anything unclear', () => {
    expect(nairaToKobo('₦8,000')).toBe('800000');
    expect(nairaToKobo('2500.5')).toBe('250050');
    for (const bad of ['', 'abc', '-5', '1.234', '12e3']) expect(() => nairaToKobo(bad)).toThrow();
  });

  it('groups one customer by an exact name (spaces and capitals ignored), keeps each debt, and totals exactly', () => {
    const plan = buildOpeningPlan(files());
    expect(plan.startsOn).toBe('2026-10-19');
    expect(plan.totals).toMatchObject({ customers: 2, jobs: 3, debtsKobo: '1750050', loansKobo: '67000000', capitalKobo: '-65249950' });
    const ade = plan.customers.find((c: { key: string }) => c.key === 'ade ogo');
    expect(ade.jobs.map((j: { salesId: string }) => j.salesId)).toEqual(['BOM-A1', 'BOM-A2']);
    expect(ade.phone).toBe('08011111111');
    expect(summarizeOpening(plan)).toMatchObject({ totalOwed: '₦17,500.50', loansOwed: '₦670,000.00' });
  });

  it('refuses a blank or unknown balance, a bad date, a future sale, a repeated sale and clashing phone numbers', () => {
    const bad = (rows: string) => () => buildOpeningPlan(files({ owing: OWING_HEADER + rows }));
    expect(bad('Kay,,,2026-09-01,x,R1,\n')).toThrow(/Leave nothing blank/);
    expect(bad('Kay,,500,01/09/2026,x,R1,\n')).toThrow(/YYYY-MM-DD/);
    expect(bad('Kay,,500,2026-10-30,x,R1,\n')).toThrow(/after the opening date/);
    expect(bad('Kay,0801,500,2026-09-01,x,R1,\nkay,0802,600,2026-09-02,y,R2,\n')).toThrow(/two different phone numbers/);
    expect(bad('Kay,,500,2026-09-01,x,,\n')).toThrow(/sales_id or sheet_row/);
    expect(bad('Kay,,0,2026-09-01,x,R1,\n')).toThrow(/more than zero/);
  });

  it('keeps several items under one Sales ID as one order, falls back to the Sheet row number, and only reports identical rows', () => {
    const plan = buildOpeningPlan(files({ owing: 'customer_name,phone,amount_owed_naira,sale_date,job_description,sales_id,sheet_row\nKay,,500,2026-09-01,Banner,BOM-K,10\nKay,,500,2026-09-01,Banner,BOM-K,11\nKay,,300,2026-09-01,Sticker,BOM-K,12\nKay,,200,2026-09-02,Card,,13\n' }));
    expect(plan.totals).toMatchObject({ customers: 1, orders: 2, jobs: 4, debtsKobo: '150000' });
    expect(plan.customers[0].jobs.map((j: { salesId: string }) => j.salesId)).toContain('Sheet row 13');
    expect(summarizeOpening(plan)).toMatchObject({ rowsIdenticalToAnotherRow: 1 });
  });

  it('applies the owner name decisions, records them, and refuses chains, clashes and half-filled rows', () => {
    const owing = OWING_HEADER + 'Kcool,,1000,2026-09-01,x,R1,\nK cool,,2000,2026-09-02,y,R2,\nkcool ,,500,2026-09-03,z,R3,\nOther,,100,2026-09-01,w,R4,\n';
    const plan = buildOpeningPlan(files({ owing, names: 'name_in_sheet,same_person_as\nK cool,Kcool\nMr Kenny,Kenny Print\n' }));
    expect(plan.totals).toMatchObject({ customers: 2, jobs: 4, debtsKobo: '360000' });
    expect(summarizeOpening(plan)).toMatchObject({ nameDecisionsApplied: ['k cool -> Kcool (1 rows)'], nameDecisionsNotUsed: ['mr kenny'] });
    // Without the decision, "Kcool" and "K cool" stay two people (only spaces and capitals are ignored).
    expect(buildOpeningPlan(files({ owing })).totals.customers).toBe(3);
    const names = (text: string) => () => buildOpeningPlan(files({ owing, names: `name_in_sheet,same_person_as\n${text}` }));
    expect(names('K cool,\n')).toThrow(/both name_in_sheet and same_person_as/);
    expect(names('K cool,Kcool\nK cool,Other\n')).toThrow(/two different names/);
    expect(names('K cool,Kcool\nKcool,Other\n')).toThrow(/itself renamed/);
    expect(buildOpeningPlan(files({ owing, names: 'name_in_sheet,same_person_as\nK cool,Kcool\n' })).digest).not.toBe(buildOpeningPlan(files({ owing })).digest);
  });

  it('refuses credits and loan types the app cannot use yet, and an empty plan', () => {
    expect(() => buildOpeningPlan(files({ credits: CREDITS + 'Mum,,1000,2026-10-01,advance,r,\n' }))).toThrow(/cannot use customer credits/);
    expect(() => buildOpeningPlan(files({ loans: 'who,type,amount_naira,date,evidence,note\nx,owner capital,100,2026-01-01,,\n' }))).toThrow(/only "loan you owe"/);
    expect(() => buildOpeningPlan(files({ owing: OWING_HEADER, loans: 'who,type,amount_naira,date,evidence,note\n' }))).toThrow(/nothing to post/);
  });

  it('gives the same fingerprint for the same files, and a different one when a figure changes', () => {
    expect(buildOpeningPlan(files()).digest).toBe(buildOpeningPlan(files()).digest);
    expect(buildOpeningPlan(files({ owing: OWING.replace('7000', '7001') })).digest).not.toBe(buildOpeningPlan(files()).digest);
    expect(formatKobo('-1750050')).toBe('-₦17,500.50');
  });
});

let db: PGlite;
let owner: string;
afterEach(async () => { await db?.close(); });
async function fresh() {
  db = await testDatabase();
  owner = await insertId(db, "insert into bomedia.staff(display_name,login_name) values('Owner','owner') returning id");
}
const net = async (code: string) => Number((await db.query<{ n: string }>(
  "select coalesce(sum(l.debit_kobo-l.credit_kobo),0)::text n from bomedia.journal_lines l join bomedia.journal_entries e on e.id=l.entry_id where e.status='posted' and l.account_code=$1", [code])).rows[0].n);

describe('opening balance posting', () => {
  it('posts the debts and the loan, verifies them, then starts the books, and the debts then behave like normal debts', async () => {
    await fresh();
    const plan = buildOpeningPlan(files());
    const posted = await postOpening(db, plan, { actorId: owner });
    expect(posted).toMatchObject({ replay: false, customers: 2, debts: 3 });
    expect(await net('1100')).toBe(1750050);
    expect(await net('2200')).toBe(-67000000);
    expect(await net('3000')).toBe(65249950);
    const report = await verifyOpening(db, plan);
    expect(report.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
    expect(report).toMatchObject({ ok: true, state: 'setup' });
    expect(await activateOpening(db, plan)).toMatchObject({ activated: true, booksStartOn: '2026-10-19' });
    expect((await db.query<{ state: string }>('select state from bomedia.bookkeeping_settings')).rows[0].state).toBe('active');
    // Each customer shows what they owe, per job, and the jobs keep the Sheet reference and sale date.
    const jobs = (await db.query<{ legacy_sales_id: string; amount_kobo: string; business_date: string; display_name: string }>(
      `select o.legacy_sales_id, j.amount_kobo::text, j.business_date::text, c.display_name from bomedia.jobs j join bomedia.orders o on o.id=j.order_id
       join bomedia.customers c on c.id=j.customer_id order by o.legacy_sales_id`)).rows;
    expect(jobs.map(j => [j.legacy_sales_id, j.amount_kobo, j.business_date])).toEqual([
      ['BOM-A1', '800000', '2026-09-03'], ['BOM-A2', '700000', '2026-10-10'], ['BOM-G1', '250050', '2026-10-12']]);
    expect(new Set(jobs.map(j => j.display_name))).toEqual(new Set(['ade ogo', 'Grace']));
  });

  it('posts a multi-item Sales ID as one order with several jobs', async () => {
    await fresh();
    const plan = buildOpeningPlan(files({ owing: 'customer_name,phone,amount_owed_naira,sale_date,job_description,sales_id\nKay,,500,2026-09-01,Banner,BOM-K\nKay,,300,2026-09-01,Sticker,BOM-K\n', loans: 'who,type,amount_naira,date,evidence,note\n' }));
    await postOpening(db, plan, { actorId: owner });
    expect((await db.query<{ orders: number; jobs: number }>('select (select count(*)::integer from bomedia.orders) orders,(select count(*)::integer from bomedia.jobs) jobs')).rows[0]).toEqual({ orders: 1, jobs: 2 });
    expect(await net('1100')).toBe(80000);
    expect(await net('3000')).toBe(-80000);
    expect((await verifyOpening(db, plan)).ok).toBe(true);
  });

  it('is safe to run twice with the same files, and refuses a different plan once something is posted', async () => {
    await fresh();
    const plan = buildOpeningPlan(files());
    await postOpening(db, plan, { actorId: owner });
    const again = await postOpening(db, plan, { actorId: owner });
    expect(again.replay).toBe(true);
    expect((await db.query<{ n: number }>('select count(*)::integer n from bomedia.customers')).rows[0].n).toBe(2);
    expect((await db.query<{ n: number }>('select count(*)::integer n from bomedia.journal_entries')).rows[0].n).toBe(2);
    const other = buildOpeningPlan(files({ owing: OWING + 'Kay,,500,2026-09-01,x,R9,\n' }));
    await expect(postOpening(db, other, { actorId: owner })).rejects.toThrow(/already exist/);
  });

  it('will not post when the books are already active, for a missing owner, or when other entries exist', async () => {
    await fresh();
    await expect(postOpening(db, buildOpeningPlan(files()), { actorId: '00000000-0000-4000-8000-000000000000' })).rejects.toThrow(/owner staff account/);
    await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values('2026-10-19','active')");
    await expect(postOpening(db, buildOpeningPlan(files()), { actorId: owner })).rejects.toThrow(/already active|different date/);
    await db.close();
    await fresh();
    await db.exec("insert into bomedia.bookkeeping_settings(starts_on,state) values('2026-10-01','setup')");
    await expect(postOpening(db, buildOpeningPlan(files()), { actorId: owner })).rejects.toThrow(/different date/);
  });

  it('lets the cashier take a payment against an opening debt the normal way, and the balances fall correctly', async () => {
    await fresh();
    const plan = buildOpeningPlan(files());
    await postOpening(db, plan, { actorId: owner });
    await activateOpening(db, plan);
    const ids = (await db.query<{ id: string; customer_id: string }>(
      `select j.id, j.customer_id from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where o.legacy_sales_id in ('BOM-A1','BOM-A2') order by o.legacy_sales_id`)).rows;
    // Staff owe the ledger a cash account to pay into; the app's own setup creates it, so create the minimum here.
    await db.exec("insert into bomedia.ledger_accounts(code,name,category,normal_side,purpose) values ('1010','Test cash','asset','debit','cash_bank') on conflict do nothing");
    const ada = await insertId(db, "insert into bomedia.staff(display_name,login_name) values('Ada','ada') returning id");
    await db.exec('set local role bomedia_financial_runtime');
    try {
      await db.query('select bomedia.api_durable_collect($1,$2::jsonb)', ['opening-pay-1', JSON.stringify({ actor_id: ada, business_date: '2026-10-19', method: 'cash', job_ids: ids.map(i => i.id), amount_kobo: '1000000' })]);
    } finally { await db.exec('reset role'); }
    const left = (await db.query<{ sales_id: string; owed: string }>(
      `select o.legacy_sales_id sales_id, (coalesce(sum(l.debit_kobo-l.credit_kobo),0))::text owed from bomedia.jobs j join bomedia.orders o on o.id=j.order_id
       left join bomedia.journal_lines l on l.job_id=j.id and l.account_code='1100' left join bomedia.journal_entries e on e.id=l.entry_id and e.status='posted'
       where o.legacy_sales_id in ('BOM-A1','BOM-A2') group by o.legacy_sales_id order by o.legacy_sales_id`)).rows;
    // 8,000 + 7,000 owed; a 10,000 payment settles the older debt first and leaves 5,000 on the newer one.
    expect(left).toEqual([{ sales_id: 'BOM-A1', owed: '0' }, { sales_id: 'BOM-A2', owed: '500000' }]);
  });

  it('creates the owner staff record once and returns the same id on a repeat', async () => {
    db = await testDatabase();
    const first = await createOwner(db);
    expect(first.created).toBe(true);
    expect(first.ownerStaffId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await createOwner(db)).toEqual({ created: false, ownerStaffId: first.ownerStaffId });
    expect((await db.query<{ n: number }>("select count(*)::integer n from bomedia.staff where login_name='owner'")).rows[0].n).toBe(1);
  });

  it('does not start the books when a check fails', async () => {
    await fresh();
    const plan = buildOpeningPlan(files());
    await postOpening(db, plan, { actorId: owner });
    await db.exec("update bomedia.jobs set amount_kobo=amount_kobo+1 where logged_by_snapshot='Sheet opening balance' and description like '%BOM-G1%'");
    await expect(activateOpening(db, plan)).rejects.toThrow(/Not activated/);
    expect((await db.query<{ state: string }>('select state from bomedia.bookkeeping_settings')).rows[0].state).toBe('setup');
  });
});
