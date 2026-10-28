-- Read existing restock payments without adding expense rows or changing profit.
-- The HTTP route verifies the owner. Only the private financial runtime can call this.
begin;
create or replace function bomedia.api_stock_purchases(list_key text, filters jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb; take_value integer; after_value uuid;
begin
  if list_key is distinct from 'list' or filters is null or jsonb_typeof(filters) <> 'object'
    or exists(select 1 from jsonb_object_keys(filters) k where k not in ('limit','after_id')) then
    raise exception 'Invalid stock purchase filters' using errcode='22023';
  end if;
  take_value:=coalesce((filters->>'limit')::integer,100);
  if take_value not between 1 and 500 then raise exception 'Limit must be 1 to 500' using errcode='22023'; end if;
  after_value:=(filters->>'after_id')::uuid;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from (
    select e.id,e.business_date,e.created_at,e.memo as description,e.evidence_reference as reference,
      s.display_name as logged_by,
      (select coalesce(sum(l.debit_kobo-l.credit_kobo),0)::text from bomedia.journal_lines l
        where l.entry_id=e.id and l.account_code='1200') as amount_kobo,
      (select string_agg(a.name,', ' order by a.code) from bomedia.journal_lines l
        join bomedia.ledger_accounts a on a.code=l.account_code
        where l.entry_id=e.id and l.credit_kobo>0 and a.purpose='cash_bank') as payment_account,
      (select m.reason from bomedia.inventory_movements m where m.roll_id=e.source_id and m.kind='restock'
        order by m.created_at,m.id limit 1) as note
    from bomedia.journal_entries e left join bomedia.staff s on s.id=e.created_by
    where e.source_type='restock' and e.status='posted' and (after_value is null or e.id>after_value)
      and not exists(select 1 from bomedia.journal_entries reversal where reversal.reverses_entry_id=e.id and reversal.status='posted')
    order by e.id limit take_value+1
  ) r;
  return jsonb_build_object('data',case when jsonb_array_length(result)>take_value then result-take_value else result end,
    'next_after_id',case when jsonb_array_length(result)>take_value then result->(take_value-1)->>'id' else null end);
end $$;
revoke all on function bomedia.api_stock_purchases(text,jsonb) from public,anon,authenticated;
grant execute on function bomedia.api_stock_purchases(text,jsonb) to bomedia_financial_runtime;
commit;
