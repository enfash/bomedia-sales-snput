"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Radio, RadioGroup, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

import { expenseCategoryStyles as styles, settingsStyles } from '@/app/theme';
import { ResponsiveSheet } from './responsive-sheet';
import { BackLink } from '@/components/back-link';
import { LoadingState } from '@/components/loading-state';

type Kind = 'everyday' | 'capital';
type Access = 'everyone' | 'chosen' | 'owner';
type Category = { name: string; kind: Kind; enabled: boolean; expense_count: number; owner_only: boolean; staff_ids: string[] };
type Person = { id: string; name: string };
const ENDPOINT = '/api/accounting/expense-category-settings';
const KIND_LABEL: Record<Kind, string> = { everyday: 'Everyday cost', capital: 'Equipment and assets' };
const ACCESS_HELP: Record<Access, string> = {
  everyone: 'Staff see it in their list.',
  chosen: 'Only the staff you pick can log it. You always can.',
  owner: 'Hidden from staff. Use it for big or sensitive spending.',
};
const message = (error: unknown) => (error instanceof Error ? error.message : 'Expense categories could not be loaded. Try again.');
const countLabel = (n: number) => `${n} expense${n === 1 ? '' : 's'}`;
const accessOf = (c: Category): Access => (!c.owner_only ? 'everyone' : c.staff_ids.length ? 'chosen' : 'owner');

function StaffChecklist({ people, picked, onChange, disabled }: { people: Person[] | null; picked: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  if (!people) return <LoadingState pieces={[{ k: 'wide' }]} label="Loading people" />;
  if (!people.length) return <Typography variant="body2" color="text.secondary">There are no staff accounts yet. Add staff in Staff Manager first.</Typography>;
  return <Box sx={styles.staffList} role="group" aria-label="Staff who can log this category">
    {people.map((p) => <FormControlLabel key={p.id} sx={styles.staffItem} disabled={disabled} label={p.name}
      control={<Checkbox checked={picked.includes(p.id)} onChange={(_, on) => onChange(on ? [...picked, p.id] : picked.filter((id) => id !== p.id))} />} />)}
  </Box>;
}

export function ExpenseCategoriesSettings() {
  const [categories, setCategories] = useState<Category[] | null>(null), [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [kind, setKind] = useState<Kind>('everyday');
  const [addAccess, setAddAccess] = useState<Access>('everyone'), [addStaff, setAddStaff] = useState<string[]>([]);
  const [picking, setPicking] = useState<Category | null>(null), [pickedStaff, setPickedStaff] = useState<string[]>([]);
  // One id per unsaved edit, so a double tap or a retry after a dropped connection saves once.
  const addId = useRef<string | null>(null), pickId = useRef<string | null>(null);

  async function load() {
    const response = await fetch(ENDPOINT, { cache: 'no-store' }), result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.data)) throw new Error(result?.error || 'Expense categories could not be loaded.');
    setCategories(result.data);
  }
  async function loadPeople() {
    const response = await fetch('/api/cashiers/access', { cache: 'no-store' }), result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.data?.staff)) throw new Error('The staff list could not be loaded, so you cannot choose staff yet.');
    setPeople(result.data.staff.map((p: { Name: string; StaffId: string }) => ({ id: p.StaffId, name: p.Name })));
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try { await load(); } catch (cause) { if (active) setError(message(cause)); }
      try { await loadPeople(); } catch { if (active) setPeople([]); }
    });
    return () => { active = false; };
  }, []);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'The category was not saved. Try again.');
  }
  const nameOf = (id: string) => people?.find((p) => p.id.toLowerCase() === id.toLowerCase())?.name ?? 'Former staff';

  const openForStaff = (categories ?? []).filter((c) => c.enabled && !c.owner_only).length;
  const trimmed = name.trim();
  const nameError = !trimmed ? 'Give the category a name.' : trimmed.length > 100 ? 'At most 100 characters.' : (categories ?? []).some((c) => c.name.toLowerCase() === trimmed.toLowerCase()) ? 'A category with that name already exists.' : '';
  const addBlocked = Boolean(nameError) || (addAccess === 'chosen' && addStaff.length === 0);

  function openAdd() { setAdding(true); setName(''); setKind('everyday'); setAddAccess('everyone'); setAddStaff([]); addId.current = null; setError(''); setSuccess(''); }
  async function add() {
    if (busy || addBlocked) return;
    addId.current ??= crypto.randomUUID();
    setBusy('add'); setError('');
    try {
      await post({ requestId: addId.current, action: 'add', name: trimmed, kind, access: addAccess, ...(addAccess === 'chosen' ? { staffIds: addStaff } : {}) });
      addId.current = null; setAdding(false); setSuccess(`Added “${trimmed}”.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  }
  async function toggle(category: Category, enabled: boolean) {
    if (busy) return;
    setBusy(category.name); setError(''); setSuccess('');
    try {
      await post({ requestId: crypto.randomUUID(), action: 'set_enabled', name: category.name, enabled });
      setSuccess(enabled ? `“${category.name}” is back on.` : `“${category.name}” is hidden from new expenses.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  }
  async function setAccess(category: Category, access: Access, staffIds?: string[]) {
    if (busy) return;
    setBusy(category.name); setError(''); setSuccess('');
    try {
      await post({ requestId: crypto.randomUUID(), action: 'set_access', name: category.name, access, ...(access === 'chosen' ? { staffIds } : {}) });
      setSuccess(access === 'everyone' ? `All staff can log “${category.name}”.` : access === 'owner' ? `“${category.name}” is now owner only.` : `Chosen staff can log “${category.name}”.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  }
  function startPicking(category: Category) { setPicking(category); setPickedStaff(category.staff_ids.map((id) => id.toLowerCase())); pickId.current = null; setError(''); }
  async function savePicked() {
    if (!picking || busy || pickedStaff.length === 0) return;
    const target = picking;
    setBusy(target.name); setError('');
    try {
      pickId.current ??= crypto.randomUUID();
      await post({ requestId: pickId.current, action: 'set_access', name: target.name, access: 'chosen', staffIds: pickedStaff });
      pickId.current = null; setPicking(null); setSuccess(`Chosen staff can log “${target.name}”.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  }

  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Box sx={[settingsStyles.heading, styles.head]}>
      <Stack spacing={1}>
        <Typography variant="h3" component="h1">Expense categories</Typography>
        <Typography color="text.secondary">The headings staff pick when they log an expense. Staff only see the ones you allow them.</Typography>
      </Stack>
      <Button variant="contained" disabled={!categories} onClick={openAdd}>Add category</Button>
    </Box>
    <Stack spacing={2}>
      {error && !adding && !picking && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      {!categories && !error && <LoadingState pieces={[{ k: 'cards', n: 4 }]} label="Loading categories" />}
      <Box sx={styles.list}>
        {categories?.map((c) => {
          const access = accessOf(c), lastOpen = c.enabled && !c.owner_only && openForStaff === 1;
          return <Paper key={c.name} variant="outlined" sx={[styles.row, ...(!c.enabled ? [styles.rowOff] : [])]}>
            <Box sx={styles.rowTop}>
              <Box sx={styles.grow}>
                <Typography variant="h6" component="h2">{c.name}</Typography>
                <Typography variant="body2" color="text.secondary">{KIND_LABEL[c.kind]} · {countLabel(c.expense_count)}{!c.enabled && ' · turned off'}</Typography>
              </Box>
              <Switch checked={c.enabled} disabled={Boolean(busy) || lastOpen}
                slotProps={{ input: { 'aria-label': `${c.name} available` } }} onChange={(_, value) => void toggle(c, value)} />
            </Box>
            <ToggleButtonGroup exclusive fullWidth size="small" value={access} sx={styles.accessGroup} aria-label={`Who can log ${c.name}`} disabled={Boolean(busy) || lastOpen}
              onChange={(_, value: Access | null) => {
                if (!value || value === access) return;
                if (value === 'chosen') startPicking(c); else void setAccess(c, value);
              }}>
              <ToggleButton value="everyone">Everyone</ToggleButton>
              <ToggleButton value="chosen">Chosen staff</ToggleButton>
              <ToggleButton value="owner">Owner only</ToggleButton>
            </ToggleButtonGroup>
            {access === 'chosen' && <Box sx={styles.chosenLine}>
              <Typography variant="body2" color="text.secondary">Can log it: {c.staff_ids.map(nameOf).join(', ')}</Typography>
              <Button size="small" color="inherit" disabled={Boolean(busy)} onClick={() => startPicking(c)}>Change</Button>
            </Box>}
            {lastOpen && <Typography variant="caption" color="text.secondary">The only category open to all staff, so it must stay on and open.</Typography>}
          </Paper>;
        })}
      </Box>
      <Typography variant="body2" color="text.secondary">
        Turning a category off hides it from new expenses; past expenses keep it. Owner only and chosen staff decide who sees and logs it; you can always log any category from the admin Expenses screen. At least one category must stay open to all staff. Everyday cost or Equipment is chosen when you add a category and cannot be changed later. To rename one, add the new name and turn the old one off.
      </Typography>
    </Stack>

    <ResponsiveSheet open={adding} onClose={() => setAdding(false)} title="Add expense category" busy={busy === 'add'}
      footer={<Box sx={styles.footer}><Button color="inherit" disabled={busy === 'add'} onClick={() => setAdding(false)}>Close</Button><Button variant="contained" disabled={busy === 'add' || addBlocked} onClick={() => void add()}>{busy === 'add' ? 'Adding…' : 'Add category'}</Button></Box>}>
      <Stack spacing={2.5} sx={styles.form}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Name staff see" value={name} disabled={busy === 'add'} error={Boolean(name) && Boolean(nameError)}
          helperText={(name && nameError) || 'Up to 100 characters. Must be different from the others.'}
          onChange={(event) => { addId.current = null; setName(event.target.value); }} slotProps={{ htmlInput: { maxLength: 120 } }} />
        <Box component="fieldset" sx={styles.fieldset}>
          <Typography component="legend" variant="body2" sx={styles.legend}>What kind of spending is it?</Typography>
          <RadioGroup value={kind} onChange={(_, value) => { addId.current = null; setKind(value as Kind); }}>
            <Stack spacing={1}>
              {([['everyday', 'Used up as you work, such as ink, transport or utilities.'], ['capital', 'Things the business keeps and owns, such as a machine.']] as const).map(([value, help]) =>
                <FormControlLabel key={value} value={value} disabled={busy === 'add'} sx={[styles.kindOption, ...(kind === value ? [styles.kindOptionOn] : [])]} control={<Radio sx={styles.radio} />}
                  label={<Box><Typography variant="body2" sx={styles.optionTitle}>{KIND_LABEL[value]}</Typography><Typography variant="caption" color="text.secondary">{help}</Typography></Box>} />)}
            </Stack>
          </RadioGroup>
          <Typography variant="caption" color="warning.main" sx={styles.hint}>You cannot change this after saving, because it decides how the money is recorded.</Typography>
        </Box>
        <Box component="fieldset" sx={styles.fieldset}>
          <Typography component="legend" variant="body2" sx={styles.legend}>Who can log it?</Typography>
          <RadioGroup value={addAccess} onChange={(_, value) => { addId.current = null; setAddAccess(value as Access); }}>
            <Stack spacing={1}>
              {([['everyone', 'Everyone'], ['chosen', 'Chosen staff'], ['owner', 'Owner only']] as const).map(([value, label]) =>
                <FormControlLabel key={value} value={value} disabled={busy === 'add'} sx={[styles.kindOption, ...(addAccess === value ? [styles.kindOptionOn] : [])]} control={<Radio sx={styles.radio} />}
                  label={<Box><Typography variant="body2" sx={styles.optionTitle}>{label}</Typography><Typography variant="caption" color="text.secondary">{ACCESS_HELP[value]}</Typography></Box>} />)}
            </Stack>
          </RadioGroup>
          {addAccess === 'chosen' && <Box sx={styles.staffPick}><StaffChecklist people={people} picked={addStaff} disabled={busy === 'add'} onChange={(ids) => { addId.current = null; setAddStaff(ids); }} /></Box>}
          <Typography variant="caption" color="text.secondary" sx={styles.hint}>You can change this later.</Typography>
        </Box>
      </Stack>
    </ResponsiveSheet>

    <ResponsiveSheet open={Boolean(picking)} onClose={() => setPicking(null)} title={picking ? `Who can log ${picking.name}?` : 'Choose staff'} busy={Boolean(busy)}
      footer={<Box sx={styles.footer}><Button color="inherit" disabled={Boolean(busy)} onClick={() => setPicking(null)}>Close</Button><Button variant="contained" disabled={Boolean(busy) || pickedStaff.length === 0} onClick={() => void savePicked()}>{busy ? 'Saving…' : 'Save'}</Button></Box>}>
      <Stack spacing={2} sx={styles.form}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">Only the staff you tick will see this category and be able to log it. You always can.</Typography>
        <StaffChecklist people={people} picked={pickedStaff} disabled={Boolean(busy)} onChange={(ids) => { pickId.current = null; setPickedStaff(ids); }} />
      </Stack>
    </ResponsiveSheet>
  </Box>;
}
