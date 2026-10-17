-- The owner's Materials list now also says how much length each size started with (all its rolls, used up or not), so Settings can draw a
-- progress bar of what is left. Only the owner read function changes; nothing is written.
begin;
do $$
declare definition text; needle text;
begin
  definition := pg_get_functiondef('bomedia.api_materials_admin()'::regprocedure);
  needle := $t$      (select count(*) from bomedia.inventory_rolls r where r.material_id = m.id and r.remaining_length_ft > 0)::integer as rolls$t$;
  if strpos(definition, needle) = 0 then raise exception 'Materials list changed'; end if;
  definition := replace(definition, needle, $t$      coalesce((select sum(r.total_length_ft) from bomedia.inventory_rolls r where r.material_id = m.id), 0) as capacity,
      (select count(*) from bomedia.inventory_rolls r where r.material_id = m.id and r.remaining_length_ft > 0)::integer as rolls$t$);
  needle := $t$'remaining_ft', trim_scale(remaining)::text,$t$;
  if strpos(definition, needle) = 0 then raise exception 'Materials list changed'; end if;
  definition := replace(definition, needle, $t$'remaining_ft', trim_scale(remaining)::text, 'capacity_ft', trim_scale(capacity)::text,$t$);
  execute definition;
end $$;
commit;
