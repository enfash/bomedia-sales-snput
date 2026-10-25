-- Fix: correcting a paid expense a second time must remember how much cash really left, not the amount after the first correction.
-- The cash paid out is read from the expense's entries in force; the plan now reports it (`paid_out_kobo`) and the corrected entry credits that
-- full amount, holding the rest in 1300.
begin;

create function bomedia.expense_paid_out(expense_value uuid) returns bigint
language sql stable security definer set search_path = pg_catalog, bomedia as $$
  select coalesce(sum(l.credit_kobo - l.debit_kobo), 0)::bigint
  from bomedia.journal_lines l join bomedia.ledger_accounts a on a.code = l.account_code
  where a.purpose = 'cash_bank' and l.entry_id in (select x.id from bomedia.expense_open_entries(expense_value) x(id))
$$;

do $$
declare definition text; needle text;
begin
  definition := pg_get_functiondef('bomedia.plan_expense_change(uuid,jsonb)'::regprocedure);
  for needle in select unnest(array[
    'declare e bomedia.expenses%rowtype; mode_value text',
    'paid := e.status = ''Paid'';',
    'if paid then excess := e.amount_kobo; end if;',
    'if paid then excess := e.amount_kobo - new_amount; end if;',
    '''paid'', paid, ''excess_kobo'', excess::text)']) loop
    if strpos(definition, needle) = 0 then raise exception 'Expense plan changed: %', needle; end if;
  end loop;
  definition := replace(definition, 'declare e bomedia.expenses%rowtype; mode_value text', 'declare paid_out bigint := 0; e bomedia.expenses%rowtype; mode_value text');
  definition := replace(definition, 'paid := e.status = ''Paid'';', 'paid := e.status = ''Paid''; paid_out := bomedia.expense_paid_out(e.id);');
  definition := replace(definition, 'if paid then excess := e.amount_kobo; end if;', 'if paid then excess := paid_out; end if;');
  definition := replace(definition, 'if paid then excess := e.amount_kobo - new_amount; end if;', 'if paid then excess := paid_out - new_amount; end if;');
  definition := replace(definition, '''paid'', paid, ''excess_kobo'', excess::text)', '''paid'', paid, ''paid_out_kobo'', paid_out::text, ''excess_kobo'', excess::text)');
  execute definition;

  definition := pg_get_functiondef('bomedia.apply_expense_change(uuid,jsonb,uuid,uuid,uuid,text)'::regprocedure);
  needle := 'jsonb_build_object(''account_code'', cash_code, ''credit_kobo'', e.amount_kobo::text)';
  if strpos(definition, needle) = 0 then raise exception 'Expense change changed'; end if;
  definition := replace(definition, needle, 'jsonb_build_object(''account_code'', cash_code, ''credit_kobo'', (plan ->> ''paid_out_kobo''))');
  execute definition;
end $$;
commit;
