-- Staff presence changes every few minutes while a cashier has the app open.
-- It does not change the sales, expense, inventory or material feeds, so it
-- must not make every device download those feeds again. Keep the trigger for
-- the rare staff changes that can alter a displayed "Logged By" name.
begin;

drop trigger if exists bump_revision_staff on bomedia.staff;
create trigger bump_revision_staff
after insert or delete or update of display_name on bomedia.staff
for each statement execute function bomedia.bump_data_revision();

commit;
