-- Staff-entered service prices are an explicit owner-selected catalog mode.
-- Existing fixed/free and owner-approved services keep their pricing and history.
-- No new privileges or public functions; the existing server-only APIs remain in place.
begin;
alter table bomedia.services drop constraint services_pricing_check;
alter table bomedia.services add constraint services_pricing_check check (pricing in ('fixed','per_job','variable'));

-- Preserve later safety fixes and grants; fail if the expected function shape changed.
do $$
declare definition text; needle text;
begin
  definition:=pg_get_functiondef('bomedia.api_service_save(text,jsonb)'::regprocedure);
  needle:=$old$not in ('fixed','per_job')$old$;
  if strpos(definition,needle)=0 then raise exception 'Review variable service migration: bomedia.api_service_save(text,jsonb) changed'; end if;
  execute replace(definition,needle,$new$not in ('fixed','per_job','variable')$new$);

  definition:=pg_get_functiondef('bomedia.screen_order_before_approvals(text,jsonb)'::regprocedure);
  needle:=$old$if not item ? 'priceRequestId' and (svc.pricing<>'fixed' or svc.unit_price_kobo<>price) then$old$;
  if strpos(definition,needle)=0 then raise exception 'Review variable service migration: bomedia.screen_order_before_approvals(text,jsonb) changed'; end if;
  execute replace(definition,needle,$new$if svc.pricing='variable' and price<=0 then
        raise exception 'Enter a positive service amount' using errcode='22023'; end if;
      if not item ? 'priceRequestId' and svc.pricing<>'variable' and (svc.pricing<>'fixed' or svc.unit_price_kobo<>price) then$new$);

  definition:=pg_get_functiondef('bomedia.screen_order_before_approvals(text,jsonb)'::regprocedure);
  needle:=$old$quote_items:=quote_items||jsonb_build_array(job-'expected_unit_price_kobo');$old$;
  if strpos(definition,needle)=0 then raise exception 'Review variable service migration: bomedia.screen_order_before_approvals(text,jsonb) changed'; end if;
  execute replace(definition,needle,$new$quote_items:=quote_items||jsonb_build_array(case when svc.pricing='variable' then job else job-'expected_unit_price_kobo' end);$new$);

  definition:=pg_get_functiondef('bomedia.post_tracked_sale(text,jsonb)'::regprocedure);
  needle:=$old$elsif svc.pricing='fixed' and svc.visible then$old$;
  if strpos(definition,needle)=0 then raise exception 'Review variable service migration: bomedia.post_tracked_sale(text,jsonb) changed'; end if;
  execute replace(definition,needle,$new$elsif svc.pricing='variable' and svc.visible then
        unit_price:=bomedia.kobo(item->>'expected_unit_price_kobo');
        if unit_price<=0 then raise exception 'Enter a positive service amount' using errcode='22023'; end if;
      elsif svc.pricing='fixed' and svc.visible then$new$);

  definition:=pg_get_functiondef('bomedia.api_quote(text,jsonb)'::regprocedure);
  needle:=$old$unit_price:=case when svc.pricing='per_job' then bomedia.kobo(asks->idx::text->>'requested_unit_price_kobo') else svc.unit_price_kobo end;$old$;
  if strpos(definition,needle)=0 then raise exception 'Review variable service migration: bomedia.api_quote(text,jsonb) changed'; end if;
  execute replace(definition,needle,$new$if svc.pricing='variable' then
        unit_price:=bomedia.kobo(item->>'expected_unit_price_kobo');
        if unit_price<=0 then raise exception 'Enter a positive service amount' using errcode='22023'; end if;
      else
        unit_price:=case when svc.pricing='per_job' then bomedia.kobo(asks->idx::text->>'requested_unit_price_kobo') else svc.unit_price_kobo end;
      end if;$new$);

end $$;
commit;
