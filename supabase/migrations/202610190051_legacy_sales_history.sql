-- Customer history (owner request, 19 Oct 2026): every sale in the Google Sheet's Sales tab, kept as READ-ONLY history on the customer.
-- These rows never touch the books, stock or what a customer owes today (that comes from the opening entries and new sales). They only
-- answer "what did this customer order before the new app, and what did it cost". Each row keeps the Sheet row it came from.
begin;

create table bomedia.legacy_sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references bomedia.customers(id),
  sheet_row integer not null unique check (sheet_row > 1),
  sale_date date not null,
  sales_id text,
  transaction_id text,
  description text not null,
  material text,
  quantity text,
  amount_kobo bigint not null,
  paid_kobo bigint not null,
  -- Amount less payments as the Sheet had it; negative when the Sheet shows more paid than the sale.
  owed_kobo bigint not null,
  payment_status text,
  job_status text,
  logged_by text,
  contact text,
  note text,
  -- Fingerprint of the file the row came from, so a different export is never mixed in by accident.
  batch text not null,
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  imported_at timestamptz not null default now()
);
create index legacy_sales_customer on bomedia.legacy_sales(customer_id, sale_date desc, sheet_row desc);
alter table bomedia.legacy_sales enable row level security;
revoke all on bomedia.legacy_sales from public, anon, authenticated, service_role;

-- One customer's old sales, newest first, with totals. Any signed-in staff member may read it (the server checks the session).
create function bomedia.api_customer_history(customer_value text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, bomedia as $$
declare cid uuid; summary jsonb; items jsonb;
begin
  if coalesce(customer_value, '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  cid := customer_value::uuid;
  if not exists (select 1 from bomedia.customers where id = cid) then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  select jsonb_build_object('rows', count(*), 'orders', count(distinct coalesce(sales_id, 'row-' || sheet_row::text)),
    'total_kobo', coalesce(sum(amount_kobo), 0)::text, 'paid_kobo', coalesce(sum(paid_kobo), 0)::text,
    'owed_kobo', coalesce(sum(greatest(owed_kobo, 0)), 0)::text, 'first_date', min(sale_date), 'last_date', max(sale_date))
  into summary from bomedia.legacy_sales where customer_id = cid;
  select coalesce(jsonb_agg(jsonb_build_object('sheet_row', sheet_row, 'sales_id', sales_id, 'date', sale_date, 'what', description,
    'material', material, 'quantity', quantity, 'amount_kobo', amount_kobo::text, 'paid_kobo', paid_kobo::text,
    'owed_kobo', greatest(owed_kobo, 0)::text, 'status', payment_status, 'job_status', job_status, 'logged_by', logged_by, 'note', note)
    order by sale_date desc, sheet_row desc), '[]'::jsonb)
  into items from (select * from bomedia.legacy_sales where customer_id = cid order by sale_date desc, sheet_row desc limit 1000) x;
  return jsonb_build_object('summary', summary, 'rows', items);
end $$;

revoke all on function bomedia.api_customer_history(text) from public;
grant execute on function bomedia.api_customer_history(text) to bomedia_financial_runtime;
commit;
