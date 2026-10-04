// No business test records commit. Credentials and row contents are never logged.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { serializeJsonParameter } from '../../lib/server/postgres-json.mjs';
import { testConnection } from './cli.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
let owner,runtime,phase='configuration';
try {
  const [flag,ref,...extra]=process.argv.slice(2);assert.equal(flag,'--confirm-project');assert.equal(extra.length,0);
  const ownerUrl=new URL(testConnection(process.env.SUPABASE_MIGRATION_DATABASE_URL,process.env.SUPABASE_MIGRATION_PROJECT_REF,ref));
  const runtimeUrl=new URL(process.env.SUPABASE_FINANCIAL_DATABASE_URL);
  assert.equal(runtimeUrl.hostname,ownerUrl.hostname);assert.equal(runtimeUrl.pathname,'/postgres');assert.equal(runtimeUrl.search,'');assert.equal(runtimeUrl.hash,'');
  assert.equal(decodeURIComponent(runtimeUrl.username),ownerUrl.hostname.endsWith('.pooler.supabase.com') ? `bomedia_financial_server.${ref}` : 'bomedia_financial_server');
  const options={ssl:{rejectUnauthorized:true,ca:await readFile(process.env.SUPABASE_CA_CERT_PATH,'utf8')},max:1,prepare:false,connect_timeout:15,onnotice:()=>{},types:{jsonText:{to:114,from:[114,3802],serialize:serializeJsonParameter,parse:JSON.parse}}};
  owner=postgres(ownerUrl.toString(),options);runtime=postgres(runtimeUrl.toString(),options);
  phase='permissions';
  const [role]=await runtime`select current_user as name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user`;
  assert.equal(role.name,'bomedia_financial_server');for(const k of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole'])assert.equal(role[k],false);
  const [privateGrants]=await owner`select exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('bomedia','migration','migration_control') and c.relkind in ('r','v')
    and has_table_privilege('bomedia_financial_server',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as direct_access`;
  assert.equal(privateGrants.direct_access,false);
  const functions=await owner`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('bomedia','migration','migration_control') and has_function_privilege('bomedia_financial_server',p.oid,'EXECUTE')`;
  assert.deepEqual(functions.map(f=>f.proname).sort(),['api_collect','api_customer','api_expense','api_expense_categories','api_expense_payment','api_payment_methods','api_read','api_report','api_sale']);
  for(const roleName of ['anon','authenticated','service_role','bomedia_auth_runtime']) {
    const [permission]=await owner`select has_function_privilege(${roleName},'bomedia.api_collect(text,jsonb)','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_read(text,jsonb)','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_report(date,date)','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_sale(text,jsonb)','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_customer(text,jsonb)','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_payment_methods()','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_expense(text,jsonb)','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_expense_payment(text,jsonb)','EXECUTE')
      or has_function_privilege(${roleName},'bomedia.api_expense_categories()','EXECUTE') as granted`;
    assert.equal(permission.granted,false);
  }
  const ledger=await owner`select name,checksum from migration_control.applied_migrations order by name`;
  const files=(await readdir(`${root}supabase/migrations`)).filter(f=>f.endsWith('.sql')).sort();assert.deepEqual(ledger.map(m=>m.name),files);
  for(const file of ledger)assert.equal(file.checksum,createHash('sha256').update(await readFile(`${root}supabase/migrations/${file.name}`)).digest('hex'));
  const counts=async()=> (await owner`select (select count(*)::int from bomedia.staff) as staff,(select count(*)::int from bomedia.customers) as customers,
    (select count(*)::int from bomedia.jobs) as jobs,(select count(*)::int from bomedia.payments) as payments,
    (select count(*)::int from bomedia.journal_entries) as journals,(select count(*)::int from bomedia.bookkeeping_settings) as settings,
    (select count(*)::int from bomedia.materials) as materials,(select count(*)::int from bomedia.inventory_rolls) as rolls,
    (select count(*)::int from bomedia.inventory_movements) as stock_movements,(select count(*)::int from bomedia.audit_events) as audits,(select count(*)::int from bomedia.idempotency_requests) as requests`)[0];
  const before=await counts();
  const memberships=async()=> await owner`select m.roleid,m.member,m.admin_option,m.inherit_option,m.set_option from pg_auth_members m
    where m.roleid=(select oid from pg_roles where rolname='bomedia_financial_server') and m.member=(select oid from pg_roles where rolname=current_user)`;
  const membershipBefore=await memberships();
  // A synthetic opening fixture must never be inserted into active books, even temporarily.
  assert.equal(before.settings,0);assert.equal(before.jobs,0);assert.equal(before.payments,0);assert.equal(before.journals,0);
  phase='live-runtime-read';
  const countsByResource={};
  for(const resource of ['customers','jobs','payments','expenses','materials','inventory','estimates','cash_accounts']) {
    const [{result}]=await runtime`select bomedia.api_read(${resource},'{}'::jsonb) as result`;
    assert(Array.isArray(result.data));countsByResource[resource]={firstPage:result.data.length,hasMore:result.next_after_id!==null};
  }
  const [{result:methods}]=await runtime`select bomedia.api_payment_methods() as result`;
  assert.deepEqual(methods.data,[{method:'cash',label:'Cash'},{method:'pos',label:'POS'},{method:'transfer',label:'Transfer'}]);
  const [{result:emptyReport}]=await runtime`select bomedia.api_report('2026-10-05','2026-10-05') as result`;
  assert.equal(emptyReport.bookkeeping,null);assert.equal(emptyReport.period_profit_kobo,'0');
  phase='rolled-back-collection';
  const rollback=new Error('Roll back synthetic financial fixture');
  try {
    await owner.begin(async tx=>{
      phase='synthetic-fixture';
      const unique=`migration-test-${randomBytes(12).toString('hex')}`;
      const [{id:actor}]=await tx`insert into bomedia.staff(display_name,login_name) values (${unique},${unique}) returning id`;
      const [{id:customer}]=await tx`insert into bomedia.customers(display_name) values (${unique}) returning id`;
      const [{id:order}]=await tx`insert into bomedia.orders(customer_id) values (${customer}) returning id`;
      const [{id:job}]=await tx`insert into bomedia.jobs(order_id,customer_id,description,quantity,unit_price_kobo,amount_kobo,job_status,business_date)
        values (${order},${customer},'Synthetic verification',1,17344999,17344999,'Pending','2026-10-05') returning id`;
      await tx`insert into bomedia.bookkeeping_settings(starts_on,state) values ('2026-10-05','active')`;
      await tx`select bomedia.post_journal(${unique},${JSON.stringify({actor_id:actor,kind:'sale',memo:'Rolled-back verification',business_date:'2026-10-05',
        source_type:'job',source_id:job,lines:[{account_code:'1100',debit_kobo:'17344999',customer_id:customer,job_id:job},{account_code:'4000',credit_kobo:'17344999'}]})}::jsonb)`;
      const [{id:material}]=await tx`insert into bomedia.materials(name,width_ft,selling_price_per_sqft_kobo) values (${unique},4,10000) returning id`;
      const [{id:roll}]=await tx`insert into bomedia.inventory_rolls(material_id,item_name,width_ft,total_length_ft,remaining_length_ft,purchase_cost_kobo,selling_price_kobo)
        values (${material},${unique},4,100,100,10000,10000) returning id`;
      await tx`update bomedia.materials set active_roll_id=${roll} where id=${material}`;
      await tx`select bomedia.post_journal(${unique+'-stock'},${JSON.stringify({actor_id:actor,kind:'adjustment',memo:'Rolled-back stock fixture',business_date:'2026-10-05',
        lines:[{account_code:'1200',debit_kobo:'10000'},{account_code:'3000',credit_kobo:'10000'}]})}::jsonb)`;
      // Fixtures are visible only in this owner transaction. SET LOCAL ROLE then
      // exercises the exact login's grants; the separate connection above proves login works.
      phase='synthetic-runtime-role';
      // Supabase's creator membership has ADMIN but not SET. Enable SET only
      // inside this rolled-back transaction; restore verification checks membership.
      const [grant]=await tx`select format('grant bomedia_financial_server to %I with set true',current_user) as ddl`;
      await tx.unsafe(grant.ddl);
      await tx`set local role bomedia_financial_server`;
      const payload={actor_id:actor,customer_id:customer,job_ids:[job],amount_kobo:'17300000',method:'cash',business_date:'2026-10-05'};
      phase='synthetic-collection';
      const [{result:first}]=await tx`select bomedia.api_collect(${unique},${JSON.stringify(payload)}::jsonb) as result`;
      const [{result:replay}]=await tx`select bomedia.api_collect(${unique},${JSON.stringify(payload)}::jsonb) as result`;assert.deepEqual(replay,first);
      const [{result:jobs}]=await tx`select bomedia.api_read('jobs',${JSON.stringify({customer_id:customer})}::jsonb) as result`;
      assert.equal(jobs.data[0].balance_kobo,'44999');
      const [{result:report}]=await tx`select bomedia.api_report('2026-10-05','2026-10-05') as result`;
      assert.equal(report.receipts_kobo,'17300000');assert.equal(report.period_profit_kobo,'17344999');
      phase='synthetic-permission-checks';
      const denied=[['select * from bomedia.staff','42501'],["select bomedia.post_journal('bad','{}')",'42501'],["select bomedia.record_payment('bad','{}')",'42501']];
      for(const [statement,code] of denied) {
        let blocked=false;try {await tx.savepoint(async sp=>{await sp.unsafe(statement);});}catch(error){blocked=error.code===code;}assert(blocked);
      }
      phase='synthetic-excess-and-one-kobo';
      let excessRejected=false;
      try {await tx.savepoint(async sp=>{await sp`select bomedia.api_collect(${unique+'-excess'},${JSON.stringify({...payload,amount_kobo:'45000'})}::jsonb)`;});}
      catch(error){excessRejected=error.code==='22023';}assert(excessRejected);
      await tx`select bomedia.api_collect(${unique+'-one-kobo'},${JSON.stringify({...payload,amount_kobo:'44998'})}::jsonb)`;
      assert.equal((await tx`select bomedia.api_read('jobs',${JSON.stringify({customer_id:customer})}::jsonb) as result`)[0].result.data[0].balance_kobo,'1');
      phase='synthetic-accounted-sale';
      const [{result:created}]=await tx`select bomedia.api_customer(${unique+'-customer'},${JSON.stringify({actor_id:actor,name:unique})}::jsonb) as result`;
      const invoice={actor_id:actor,customer_id:created.customer_id,business_date:'2026-10-05',initial_payment_kobo:'10000',payment_method:'cash',
        jobs:[{material_id:material,description:'Synthetic banner',quantity:'1',width_ft:'2',height_ft:'3',expected_unit_price_kobo:'60000'}]};
      const [{result:sold}]=await tx`select bomedia.api_sale(${unique+'-sale'},${JSON.stringify(invoice)}::jsonb) as result`;
      assert.equal(sold.total_kobo,'60000');assert.equal(sold.job_ids.length,1);
      assert.deepEqual((await tx`select bomedia.api_sale(${unique+'-sale'},${JSON.stringify(invoice)}::jsonb) as result`)[0].result,sold);
      const [{result:newJobs}]=await tx`select bomedia.api_read('jobs',${JSON.stringify({customer_id:created.customer_id})}::jsonb) as result`;
      assert.equal(newJobs.data[0].balance_kobo,'50000');
      const [{result:inventory}]=await tx`select bomedia.api_read('inventory','{"limit":500}'::jsonb) as result`;
      assert.equal(inventory.data.find(i=>i.id===roll).remaining_length_ft,'98.000000');
      phase='synthetic-payment-methods';
      for(const [method,code,label] of [['transfer','1010','Transfer'],['pos','1020','POS']]) {
        const body={actor_id:actor,customer_id:created.customer_id,job_ids:sold.job_ids,amount_kobo:'10000',business_date:'2026-10-05',method};
        const [{result:receipt}]=await tx`select bomedia.api_collect(${unique+'-'+method},${JSON.stringify(body)}::jsonb) as result`;
        assert.deepEqual((await tx`select bomedia.api_collect(${unique+'-'+method},${JSON.stringify(body)}::jsonb) as result`)[0].result,receipt);
        const [{result:receipts}]=await tx`select bomedia.api_read('payments',${JSON.stringify({customer_id:created.customer_id})}::jsonb) as result`;
        assert.equal(receipts.data.find(p=>p.id===receipt.payment_id).method,label);
        const [{result:balances}]=await tx`select bomedia.api_report('2026-10-05','2026-10-05') as result`;
        assert.equal(balances.accounts.find(a=>a.code===code).debit_kobo,'10000');
      }
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  phase='rollback-verification';assert.deepEqual(await counts(),before);assert.deepEqual(await memberships(),membershipBefore);
  const report={verifiedAt:new Date().toISOString(),verified:true,migrations:ledger.map(m=>m.name),role:role.name,
    directPrivateAccess:false,capabilities:functions.map(f=>f.proname).sort(),syntheticChangesRolledBack:true,temporaryRoleMembershipRolledBack:true,
    paymentMethods:'cash/transfer/pos verified',paymentReplay:'passed',accountedSaleReplay:'passed',trustedTilingAndStock:'passed',shortPayments:'passed',excessRejected:true,counts:before,reads:countsByResource,backendActivated:false};
  await writeFile(`${root}migration-data/hosted-financial-verification-20261004.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}catch(error) {console.error(`Financial verification failed at ${phase} (${error.code || 'verification'}); no credentials or row contents logged.`);process.exitCode=1;}
finally {await Promise.all([owner?.end({timeout:5}),runtime?.end({timeout:5})]);}
