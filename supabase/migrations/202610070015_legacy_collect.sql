-- The existing payment boxes save to Postgres (owner decision 7 Oct: keep the
-- screens staff know). Local only. The debtor box and the Records "Manage"
-- box name jobs by their board row number, Sales ID or job ID; this resolves
-- them to one customer's jobs and records one payment, applied oldest first
-- with any rounding on the last job, as the old waterfall did.
begin;
create function bomedia.api_legacy_collect(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare ref text; job_ids uuid[]:='{}'; job_value uuid; customers uuid[];
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k<>all(array['actor_id','job_refs','amount_kobo','business_date','method','notes'])) then
    raise exception 'Unexpected payment field' using errcode='22023'; end if;
  if jsonb_typeof(payload->'job_refs') is distinct from 'array' or jsonb_array_length(payload->'job_refs') not between 1 and 500 then
    raise exception 'Choose 1 to 500 jobs' using errcode='22023'; end if;
  for ref in select btrim(value) from jsonb_array_elements_text(payload->'job_refs') loop
    job_value:=null;
    if ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into job_value from bomedia.jobs where id=ref::uuid;
    elsif ref ~ '^[0-9]{1,18}$' then
      select id into job_value from bomedia.jobs where collection_sequence=ref::bigint;
    elsif (select count(*) from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where o.legacy_sales_id=ref)=1 then
      select j.id into job_value from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where o.legacy_sales_id=ref;
    end if;
    if job_value is null then raise exception 'Job not found' using errcode='P0002'; end if;
    if not job_value=any(job_ids) then job_ids:=job_ids||job_value; end if;
  end loop;
  select array_agg(distinct customer_id) into customers from bomedia.jobs where id=any(job_ids);
  if cardinality(customers)<>1 then raise exception 'All jobs must belong to one customer' using errcode='22023'; end if;
  return bomedia.api_collect(request_id,jsonb_strip_nulls(jsonb_build_object('actor_id',payload->'actor_id','customer_id',customers[1],
    'job_ids',to_jsonb(job_ids),'amount_kobo',payload->'amount_kobo','business_date',payload->'business_date',
    'method',payload->'method','notes',payload->'notes')));
end $$;
revoke all on function bomedia.api_legacy_collect(text,jsonb) from public;
grant execute on function bomedia.api_legacy_collect(text,jsonb) to bomedia_financial_runtime;
commit;
