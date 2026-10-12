import postgres from 'postgres';
import { serializeJsonParameter } from './postgres-json.mjs';
import { readFile } from 'node:fs/promises';

export type FinancialMethod = 'api_collect' | 'api_read' | 'api_report' | 'api_sale' | 'api_customer' | 'api_payment_methods'
  | 'api_expense' | 'api_expense_payment' | 'api_expense_categories' | 'api_expenses_awaiting'
  | 'api_restock' | 'api_waste' | 'api_stock_count'
  | 'api_quote' | 'api_quote_lookup' | 'api_price_requests' | 'api_price_decision'
  | 'api_services' | 'api_service_save' | 'api_legacy_feed' | 'api_job_status' | 'api_legacy_sale' | 'api_durable_collect' | 'api_legacy_collect' | 'api_screen_order' | 'api_order_catalog' | 'api_screen_expense' | 'api_receipt' | 'api_business_details' | 'api_business_details_save' | 'api_services_reorder' | 'api_payment_methods_admin' | 'api_payment_method_save' | 'api_audit_log' | 'api_system_status' | 'api_bookkeeping_period' | 'api_close_books' | 'api_materials_admin' | 'api_unavailable_materials' | 'api_material_save' | 'api_material_sales' | 'api_expense_categories_admin' | 'api_expense_category_save'
  | 'api_approval_rules' | 'api_approval_rule_save' | 'api_approvals' | 'api_my_approvals' | 'api_approval_decision'
  | 'api_customers' | 'api_customer_profile' | 'api_customer_save';
export type FinancialCall = <T>(method: FinancialMethod, key: string, payload: Record<string, unknown>) => Promise<T>;
let database: Promise<ReturnType<typeof postgres>> | undefined;
export function financialApiEnabled(): boolean {
  if (process.env.POSTGRES_FINANCIAL_API_ENABLED !== 'true') return false;
  if (process.env.AUTH_BACKEND !== 'postgres') throw new Error('PostgreSQL authentication is required');
  return true;
}
export function validateFinancialConnection(raw: string | undefined, ref: string | undefined): string {
  if (!raw || !ref || !/^[a-z0-9]{20}$/.test(ref)) throw new Error('Financial database is not configured');
  const url = new URL(raw);
  const username = decodeURIComponent(url.username);
  const direct = url.hostname === `db.${ref}.supabase.co` && username === 'bomedia_financial_server';
  const pool = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname) && username === `bomedia_financial_server.${ref}`;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pool) || !url.password
    || url.pathname !== '/postgres' || url.search || url.hash || (url.port && !['5432','6543'].includes(url.port))) {
    throw new Error('Use the dedicated financial role connection');
  }
  return url.toString();
}
async function connect() {
  const url = validateFinancialConnection(process.env.SUPABASE_FINANCIAL_DATABASE_URL,
    process.env.SUPABASE_PROJECT_REF || process.env.SUPABASE_MIGRATION_PROJECT_REF);
  const ca = process.env.SUPABASE_CA_CERT_PEM?.replace(/\\n/g, '\n')
    || (process.env.SUPABASE_CA_CERT_PATH ? await readFile(process.env.SUPABASE_CA_CERT_PATH, 'utf8') : undefined);
  const sql = postgres(url,{ssl:{rejectUnauthorized:true,...(ca ? {ca} : {})},max:2,prepare:false,connect_timeout:10,idle_timeout:20,onnotice:()=>{},
    types:{jsonText:{to:114,from:[114,3802],serialize:serializeJsonParameter,parse:JSON.parse}}});
  try {
    const [role] = await sql`select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,
      pg_has_role(current_user,'bomedia_financial_runtime','MEMBER') as member from pg_roles where rolname=current_user`;
    if (!role || role.rolname !== 'bomedia_financial_server' || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || !role.member) {
      throw new Error('Unexpected runtime role');
    }
    return sql;
  } catch { await sql.end({timeout:2}); throw new Error('Financial database is unavailable'); }
}
export const callFinancial: FinancialCall = async <T>(method: FinancialMethod, key: string, payload: Record<string, unknown>): Promise<T> => {
  if (!['api_collect','api_read','api_report','api_sale','api_customer','api_payment_methods','api_expense','api_expense_payment','api_expense_categories','api_expenses_awaiting','api_restock','api_waste','api_stock_count','api_quote','api_quote_lookup','api_price_requests','api_price_decision','api_services','api_service_save','api_legacy_feed','api_job_status','api_legacy_sale','api_legacy_collect','api_durable_collect','api_screen_order','api_order_catalog','api_screen_expense','api_receipt','api_business_details','api_business_details_save','api_services_reorder','api_payment_methods_admin','api_payment_method_save','api_audit_log','api_system_status','api_bookkeeping_period','api_close_books','api_materials_admin','api_unavailable_materials','api_material_save','api_material_sales','api_expense_categories_admin','api_expense_category_save','api_approval_decision','api_customers','api_customer_profile','api_customer_save','api_approval_rule_save','api_approval_rules','api_approvals','api_my_approvals'].includes(method)) throw new Error('Unknown financial operation');
  database ??= connect().catch(error => {database=undefined;throw error;});
  const sql = await database;
  if (method==='api_payment_methods') return (await sql`select bomedia.api_payment_methods() as result`)[0].result as T;
  if (method==='api_payment_methods_admin') return (await sql`select bomedia.api_payment_methods_admin() as result`)[0].result as T;
  if (method==='api_expense_categories_admin') return (await sql`select bomedia.api_expense_categories_admin() as result`)[0].result as T;
  if (method==='api_expense_categories') return (await sql`select bomedia.api_expense_categories() as result`)[0].result as T;
  if (method==='api_expenses_awaiting') return (await sql`select bomedia.api_expenses_awaiting() as result`)[0].result as T;
  if (method==='api_materials_admin') return (await sql`select bomedia.api_materials_admin() as result`)[0].result as T;
  if (method==='api_material_sales') return (await sql`select bomedia.api_material_sales() as result`)[0].result as T;
  if (method==='api_unavailable_materials') return (await sql`select bomedia.api_unavailable_materials() as result`)[0].result as T;
  if (method==='api_bookkeeping_period') return (await sql`select bomedia.api_bookkeeping_period() as result`)[0].result as T;
  if (method==='api_system_status') return (await sql`select bomedia.api_system_status() as result`)[0].result as T;
  if (method==='api_business_details') return (await sql`select bomedia.api_business_details() as result`)[0].result as T;
  if (method==='api_approval_rules') return (await sql`select bomedia.api_approval_rules() as result`)[0].result as T;
  if (method==='api_customers') return (await sql`select bomedia.api_customers() as result`)[0].result as T;
  if (method==='api_customer_profile') return (await sql`select bomedia.api_customer_profile(${key}) as result`)[0].result as T;
  if (method==='api_approvals') return (await sql`select bomedia.api_approvals() as result`)[0].result as T;
  if (method==='api_my_approvals') return (await sql`select bomedia.api_my_approvals(${key}) as result`)[0].result as T;
  if (method==='api_price_requests') return (await sql`select bomedia.api_price_requests() as result`)[0].result as T;
  if (method==='api_services') return (await sql`select bomedia.api_services(${key==='all'}) as result`)[0].result as T;
  if (method==='api_legacy_feed') return (await sql`select bomedia.api_legacy_feed(${key}) as result`)[0].result as T;
  if (method==='api_quote_lookup') return (await sql`select bomedia.api_quote_lookup(${key}) as result`)[0].result as T;
  const statement = method === 'api_report'
    ? "select bomedia.api_report($1::date,($2::jsonb->>'through')::date) as result"
    : `select bomedia.${method}($1,$2::jsonb) as result`;
  return (await sql.unsafe(statement,[key,JSON.stringify(payload)]))[0].result as T;
};
