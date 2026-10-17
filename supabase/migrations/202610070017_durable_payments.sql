-- Corrective migration: preserve all previously applied migration checksums.
begin;
create or replace function bomedia.next_reference(prefix text, seq regclass) returns text
language sql volatile set search_path=pg_catalog,bomedia as $$
  select prefix||'-'||to_char(now() at time zone 'Africa/Lagos','YYYYMMDD')||'-'||lpad(n, greatest(4,length(n)), '0')
  from (select nextval(seq)::text n) value
$$;

create function bomedia.api_durable_collect(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
declare actor uuid; previous jsonb; result jsonb; ids uuid[]; customers uuid[]; status_result jsonb;
begin
  actor:=bomedia.stock_actor(request_id,payload,array['actor_id','job_ids','amount_kobo','business_date','method','notes','job_status','any_age']);
  -- Acquire replay lock before resolving mutable jobs or applying a status.
  previous:=bomedia.prior_result('durable_collection',request_id,payload);
  if previous is not null then return previous; end if;
  perform bomedia.check_business_date(payload->>'business_date');
  if jsonb_typeof(payload->'job_ids') is distinct from 'array' or jsonb_array_length(payload->'job_ids') not between 1 and 500 then
    raise exception 'Select jobs' using errcode='22023'; end if;
  select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(payload->'job_ids');
  if array_position(ids,null) is not null or cardinality(ids)<>(select count(distinct v) from unnest(ids) v)
    or cardinality(ids)<>(select count(*) from bomedia.jobs where id=any(ids)) then
    raise exception 'Select distinct existing jobs' using errcode='22023'; end if;
  select array_agg(distinct customer_id) into customers from bomedia.jobs where id=any(ids);
  if cardinality(customers)<>1 then raise exception 'Select jobs for one customer' using errcode='22023'; end if;
  if payload ? 'job_status' and cardinality(ids)<>1 then raise exception 'Status requires one job' using errcode='22023'; end if;
  -- The collection acquires settings then job locks. Status uses those locks in
  -- the same transaction; a status failure rolls the entire receipt back.
  result:=bomedia.api_collect('durable/'||request_id,jsonb_strip_nulls(jsonb_build_object('actor_id',actor,
    'customer_id',customers[1],'job_ids',to_jsonb(ids),'amount_kobo',payload->'amount_kobo',
    'business_date',payload->'business_date','method',payload->'method','notes',payload->'notes')));
  if payload ? 'job_status' then
    status_result:=bomedia.api_job_status('durable-status/'||request_id,jsonb_build_object('actor_id',actor,
      'job_ref',ids[1],'status',payload->>'job_status','any_age',coalesce((payload->>'any_age')::boolean,false)));
    result:=result||status_result;
  end if;
  insert into bomedia.idempotency_requests(operation,request_key,payload_sha256,actor_id,response)
    values('durable_collection',request_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),actor,result);
  return result;
end $$;
revoke all on function bomedia.api_durable_collect(text,jsonb) from public;
grant execute on function bomedia.api_durable_collect(text,jsonb) to bomedia_financial_runtime;
commit;
