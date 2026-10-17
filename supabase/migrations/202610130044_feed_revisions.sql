-- The Records and Expenses feeds now say how many times a sale or an expense has been corrected (`_revisions`), so the lists can show a
-- "Corrected" tag without opening each one. Cancelled ones are already marked by their status. Read only.
begin;
create or replace function bomedia.api_legacy_feed(resource_value text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb;
begin
  result:=bomedia.legacy_feed_rows(resource_value);
  if resource_value='expenses' then
    -- legacy_feed_rows numbers expenses by (created_at, id); the same ordering gives the same position here.
    select coalesce(jsonb_agg(r.row||jsonb_build_object('_loggedById',coalesce(x.logged_by::text,''),'_revisions',coalesce(x.revisions,0)::text) order by r.n),'[]') into result
    from jsonb_array_elements(result) with ordinality r(row,n)
    left join (select e.logged_by,(select count(*) from bomedia.expense_revisions v where v.expense_id=e.id) as revisions,
        row_number() over (order by e.created_at,e.id) as rn from bomedia.expenses e) x on x.rn=r.n;
    return result;
  end if;
  if resource_value<>'sales' then return result; end if;
  select coalesce(jsonb_agg(r.row||jsonb_build_object('_jobId',j.id::text,'_customerId',j.customer_id::text,
      '_revisions',(select count(*) from bomedia.job_revisions v where v.job_id=j.id)::text) order by r.n),'[]') into result
  from jsonb_array_elements(result) with ordinality r(row,n) join bomedia.jobs j on j.collection_sequence=(r.row->>'_rowIndex')::bigint;
  return result;
end $$;
commit;
