-- Inventory's "Realised revenue" used to be feet used x the material's CURRENT price, so changing a price rewrote past earnings.
-- Now that the owner changes prices deliberately (Settings > Materials), earnings come from what the material's jobs actually sold for.
begin;

-- Read only. One row per material that has jobs: its readable code and the total sold, in the feed's naira text.
create function bomedia.api_material_sales() returns jsonb
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', bomedia.material_code(m.legacy_material_id, m.name, m.width_ft),
    'sold', bomedia.naira_text(s.sold_kobo))), '[]'::jsonb)
  from (select material_id, sum(amount_kobo) as sold_kobo from bomedia.jobs where material_id is not null group by material_id) s
  join bomedia.materials m on m.id = s.material_id
$$;

revoke all on function bomedia.api_material_sales() from public;
grant execute on function bomedia.api_material_sales() to bomedia_financial_runtime;
commit;
