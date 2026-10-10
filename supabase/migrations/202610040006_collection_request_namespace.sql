-- Separate public collection retries from automatic initial sale receipts.
-- No runtime financial writes exist at this migration checkpoint. Refuse to
-- change request-key semantics if the old API has already been used live.
begin;
do $$ begin
  if exists(select 1 from bomedia.idempotency_requests where operation='accounted_payment') then
    raise exception 'Existing payment retries require an explicit compatibility migration';
  end if;
end $$;
create or replace function bomedia.api_collect(request_id text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,bomedia as $$
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Payment payload is required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in
    ('actor_id','customer_id','job_ids','amount_kobo','business_date','cash_account_code','method','notes')) then
    raise exception 'Unexpected payment field' using errcode='22023'; end if;
  if not exists(select 1 from bomedia.staff where id=(payload->>'actor_id')::uuid and disabled_at is null) then
    raise exception 'An enabled collector is required' using errcode='42501'; end if;
  if request_id is null or btrim(request_id)='' or length(request_id)>200 then
    raise exception 'Invalid operation key' using errcode='22023'; end if;
  return bomedia.record_accounted_payment('api-collection/'||encode(sha256(convert_to(request_id,'UTF8')),'hex'),payload);
end $$;
commit;
