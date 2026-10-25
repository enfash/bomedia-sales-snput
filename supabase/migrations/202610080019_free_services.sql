-- Owner-requested free services. Existing migrations and saved replies remain intact.
-- Free is a fixed catalog price of zero, not a staff discount or payment.
begin;
alter table bomedia.services drop constraint services_unit_price_kobo_check;
alter table bomedia.services add constraint services_unit_price_kobo_check check(unit_price_kobo>=0);

do $$
declare definition text; needle text; replacement text;
begin
  definition:=pg_get_functiondef('bomedia.api_screen_order(text,jsonb)'::regprocedure);
  needle:='or q<>trunc(q) or price<=0 or';
  if strpos(definition,needle)=0 then raise exception 'Screen order validation changed; review the free-service migration'; end if;
  definition:=replace(definition,needle,$text$or q<>trunc(q) or (price=0 and item->>'kind'<>'service') or$text$);
  execute definition;

  definition:=pg_get_functiondef('bomedia.post_tracked_sale(text,jsonb)'::regprocedure);
  needle:='logged_by_snapshot=name_value where id=job;';
  if strpos(definition,needle)=0 then raise exception 'Tracked sale changed; review the free-service migration'; end if;
  replacement:=needle||$text$
    -- Keep the job and audit trail, but do not invent zero-value ledger lines.
    -- This can only be a catalog-priced free service: print/approved prices stay positive.
    if item ? 'service_id' and (item->>'amount_kobo')::bigint=0 then
      idx:=idx+1;
      continue;
    end if;
  $text$;
  execute replace(definition,needle,replacement);
end $$;
commit;
