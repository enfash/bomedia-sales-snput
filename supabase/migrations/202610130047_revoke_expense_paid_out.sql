-- expense_paid_out (migration 046) is an internal helper like the others: nobody calls it directly.
begin;
revoke all on function bomedia.expense_paid_out(uuid) from public;
commit;
