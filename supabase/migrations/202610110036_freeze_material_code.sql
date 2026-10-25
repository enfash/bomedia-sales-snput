-- A material's readable code (FLEX-10FT) is derived from its name and width unless a legacy code is stored. Renaming a material
-- must never change its code (Inventory search, waiting entries and saved links use it), so the moment a name changes the
-- derived code is stored. Materials that already have a stored code are untouched.
begin;

create function bomedia.freeze_material_code() returns trigger
language plpgsql set search_path = pg_catalog, bomedia as $$
begin
  if new.name is distinct from old.name and old.legacy_material_id is null and new.legacy_material_id is null then
    new.legacy_material_id := bomedia.material_code(null, old.name, old.width_ft);
  end if;
  return new;
end $$;
create trigger freeze_material_code before update of name on bomedia.materials
  for each row execute function bomedia.freeze_material_code();

revoke all on function bomedia.freeze_material_code() from public;
commit;
