-- The old expenses feed gains the logging staff member's id (_loggedById) so the server can show each
-- cashier only their own entries. The server removes the key before anything is sent to a browser.
begin;
create or replace function bomedia.api_legacy_feed(resource_value text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb;
begin
  result:=bomedia.legacy_feed_rows(resource_value);
  if resource_value='expenses' then
    -- legacy_feed_rows numbers expenses by (created_at, id); the same ordering gives the same position here.
    select coalesce(jsonb_agg(r.row||jsonb_build_object('_loggedById',coalesce(x.logged_by::text,'')) order by r.n),'[]') into result
    from jsonb_array_elements(result) with ordinality r(row,n)
    left join (select e.logged_by,row_number() over (order by e.created_at,e.id) as rn from bomedia.expenses e) x on x.rn=r.n;
    return result;
  end if;
  if resource_value<>'sales' then return result; end if;
  select coalesce(jsonb_agg(r.row||jsonb_build_object('_jobId',j.id::text,'_customerId',j.customer_id::text) order by r.n),'[]') into result
  from jsonb_array_elements(result) with ordinality r(row,n) join bomedia.jobs j on j.collection_sequence=(r.row->>'_rowIndex')::bigint;
  return result;
end $$;
commit;
