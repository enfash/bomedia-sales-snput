-- Job status from the job board, and customer/job IDs in the legacy feed. Local only. Status is workflow, not money:
-- no journal. Staff may change a job only within 24 hours of recording it, as
-- on today's board; the server sets any_age only for the verified owner. The
-- board names a job by its Sales ID (a job UUID, or a legacy Sales ID) or by
-- the row number the legacy feed gave it.
begin;
create function bomedia.api_job_status(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid; ref text; status_value text; job record; matches integer;
begin
  actor:=bomedia.stock_actor(request_id,payload,array['actor_id','job_ref','status','any_age']);
  ref:=btrim(coalesce(payload->>'job_ref',''));
  status_value:=payload->>'status';
  if status_value is null or status_value<>all(array['Quoted','Printing','Finishing','Ready','Delivered']) then
    raise exception 'Choose a valid job status' using errcode='22023'; end if;
  if ref='' or length(ref)>200 then raise exception 'Choose a job' using errcode='22023'; end if;
  if ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select count(*) into matches from bomedia.jobs where id=ref::uuid;
    select j.* into job from bomedia.jobs j where j.id=ref::uuid for update;
  elsif ref ~ '^[0-9]{1,18}$' then
    select count(*) into matches from bomedia.jobs where collection_sequence=ref::bigint;
    select j.* into job from bomedia.jobs j where j.collection_sequence=ref::bigint for update;
  else
    select count(*) into matches from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where o.legacy_sales_id=ref;
    select j.* into job from bomedia.jobs j join bomedia.orders o on o.id=j.order_id where o.legacy_sales_id=ref for update of j;
  end if;
  if matches<>1 then raise exception 'Job not found' using errcode='P0002'; end if;
  if coalesce((payload->>'any_age')::boolean,false) is not true and job.created_at<now()-interval '24 hours' then
    raise exception 'Only the owner can change jobs older than 24 hours' using errcode='42501'; end if;
  if job.job_status is distinct from status_value then
    update bomedia.jobs set job_status=status_value where id=job.id;
    insert into bomedia.audit_events(actor_id,action,entity_type,entity_id,details)
      values(actor,'job_status','job',job.id,jsonb_build_object('from',job.job_status,'to',status_value));
  end if;
  return jsonb_build_object('job_id',job.id,'job_status',status_value);
end $$;
revoke all on function bomedia.api_job_status(text,jsonb) from public;
grant execute on function bomedia.api_job_status(text,jsonb) to bomedia_financial_runtime;
-- The old payment buttons hand off to Accounting entry's Payment tab, which
-- needs the customer's database ID. Sales rows gain _customerId and _jobId.
alter function bomedia.api_legacy_feed(text) rename to legacy_feed_rows;
revoke all on function bomedia.legacy_feed_rows(text) from public, bomedia_financial_runtime;
create function bomedia.api_legacy_feed(resource_value text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,bomedia as $$
declare result jsonb;
begin
  result:=bomedia.legacy_feed_rows(resource_value);
  if resource_value<>'sales' then return result; end if;
  select coalesce(jsonb_agg(r.row||jsonb_build_object('_jobId',j.id::text,'_customerId',j.customer_id::text) order by r.n),'[]') into result
  from jsonb_array_elements(result) with ordinality r(row,n) join bomedia.jobs j on j.collection_sequence=(r.row->>'_rowIndex')::bigint;
  return result;
end $$;
revoke all on function bomedia.api_legacy_feed(text) from public;
grant execute on function bomedia.api_legacy_feed(text) to bomedia_financial_runtime;
commit;
