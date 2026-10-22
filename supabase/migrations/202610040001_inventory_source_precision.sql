-- Preserve roll-level categories and fractional-kobo costing rates from Sheets.
-- Existing integer-kobo rate remains for compatibility; new costing code must
-- use the exact rate. This migration does not change stock or populate records.
begin;
alter table bomedia.inventory_rolls add column category text;
alter table bomedia.inventory_rolls add column cost_per_sqft_kobo_exact numeric(24,6)
  check (cost_per_sqft_kobo_exact >= 0 and cost_per_sqft_kobo_exact < 'Infinity'::numeric);
comment on column bomedia.inventory_rolls.cost_per_sqft_kobo_exact is
  'Costing rate in kobo per sqft, retaining fractional kobo; cash amounts remain integer kobo.';
commit;
