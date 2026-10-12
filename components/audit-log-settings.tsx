"use client";

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, Paper, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { auditLogStyles as styles, settingsStyles } from '@/app/theme';
import { CATEGORY_LABEL, describeAudit, detailLines, groupByDay, timeLabel, type AuditCategory, type AuditEntryView } from '@/lib/audit-log-format';
import { BackLink } from '@/components/back-link';

type Cursor = { at: string; id: string };
type Page = { data: AuditEntryView[]; next_before: Cursor | null; people: { id: string; name: string }[] };
const ENDPOINT = '/api/accounting/audit-log';
const CATEGORIES = Object.keys(CATEGORY_LABEL).filter((key) => key !== 'other') as AuditCategory[];
const TAG_STYLE = { signins: styles.tagSignins, staff: styles.tagStaff, sales: styles.tagSales, expenses: styles.tagExpenses,
  stock: styles.tagStock, settings: styles.tagSettings, approvals: styles.tagApprovals, other: styles.tagOther } as const;
const RANGES = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']] as const;
const message = (error: unknown) => (error instanceof Error ? error.message : 'The audit log could not be loaded. Try again.');

export function AuditLogSettings() {
  const [entries, setEntries] = useState<AuditEntryView[] | null>(null);
  const [next, setNext] = useState<Cursor | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [category, setCategory] = useState<AuditCategory | ''>(''), [staff, setStaff] = useState(''), [range, setRange] = useState('7d');
  const [error, setError] = useState(''), [loadingMore, setLoadingMore] = useState(false), [open, setOpen] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursor: Cursor | null): Promise<Page> => {
    const params = new URLSearchParams({ range });
    if (category) params.set('category', category);
    if (staff) params.set('staff', staff);
    if (cursor) { params.set('beforeAt', cursor.at); params.set('beforeId', cursor.id); }
    const response = await fetch(`${ENDPOINT}?${params}`, { cache: 'no-store' }), result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.data)) throw new Error(result?.error || 'The audit log could not be loaded.');
    return result as Page;
  }, [category, staff, range]);

  // A new filter starts from the newest entry again.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setEntries(null); setError(''); setOpen(null);
      try {
        const page = await fetchPage(null);
        if (!active) return;
        setEntries(page.data); setNext(page.next_before); setPeople(page.people);
      } catch (cause) { if (active) { setError(message(cause)); setEntries([]); setNext(null); } }
    });
    return () => { active = false; };
  }, [fetchPage]);

  async function more() {
    if (!next || loadingMore) return;
    setLoadingMore(true); setError('');
    try {
      const page = await fetchPage(next);
      setEntries((current) => [...(current ?? []), ...page.data]); setNext(page.next_before);
    } catch (cause) { setError(message(cause)); }
    finally { setLoadingMore(false); }
  }

  const groups = groupByDay(entries ?? []);
  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Stack spacing={1} sx={settingsStyles.heading}>
      <Typography variant="h3" component="h1">Audit log</Typography>
      <Typography color="text.secondary">A record of who did what in the app. Entries cannot be edited or deleted.</Typography>
    </Stack>

    <Box sx={styles.filters}>
      <TextField select label="Who" value={staff} onChange={(event) => setStaff(event.target.value)} size="small" slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
        <MenuItem value="">Everyone</MenuItem>
        {people.map((person) => <MenuItem key={person.id} value={person.id}>{person.name}</MenuItem>)}
      </TextField>
      <TextField select label="When" value={range} onChange={(event) => setRange(event.target.value)} size="small">
        {RANGES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
      </TextField>
    </Box>
    <Box sx={styles.chips} role="group" aria-label="Kind of activity">
      <Button sx={styles.chip} variant={category === '' ? 'contained' : 'outlined'} color={category === '' ? 'primary' : 'inherit'} aria-pressed={category === ''} onClick={() => setCategory('')}>All</Button>
      {CATEGORIES.map((key) => <Button key={key} sx={styles.chip} variant={category === key ? 'contained' : 'outlined'} color={category === key ? 'primary' : 'inherit'}
        aria-pressed={category === key} onClick={() => setCategory(key)}>{CATEGORY_LABEL[key]}</Button>)}
    </Box>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {entries === null && <Stack spacing={1}>{[0, 1, 2, 3].map((n) => <Skeleton key={n} variant="rounded" height={56} />)}</Stack>}
    {entries !== null && entries.length === 0 && !error && <Paper variant="outlined" sx={styles.empty}>
      <Typography variant="h6" color="text.secondary">Nothing recorded for these filters</Typography>
      <Typography variant="body2" color="text.disabled">Try a longer time range or a different kind of activity.</Typography>
    </Paper>}

    {groups.map((group) => <Box key={group.label + group.entries[0].id}>
      <Typography variant="overline" sx={styles.dayHeading}>{group.label}</Typography>
      <Paper variant="outlined" sx={styles.card}>
        {group.entries.map((entry) => {
          const { who, text } = describeAudit(entry), lines = detailLines(entry), isOpen = open === entry.id;
          return <Box key={entry.id} sx={[styles.row, isOpen && styles.rowOpen]}>
            <Box sx={styles.rowTop}>
              <Typography variant="body2" sx={styles.time}>{timeLabel(entry.at)}</Typography>
              <Typography sx={styles.text}><strong>{who}</strong> {text}</Typography>
              <Box component="span" sx={[styles.tag, TAG_STYLE[entry.category] ?? styles.tagOther]}>{CATEGORY_LABEL[entry.category] ?? CATEGORY_LABEL.other}</Box>
              {lines.length > 0 && <IconButton sx={styles.toggle} aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} details: ${who} ${text}`}
                onClick={() => setOpen(isOpen ? null : entry.id)}>{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</IconButton>}
              {lines.length === 0 && <Box aria-hidden sx={styles.togglePlaceholder} />}
            </Box>
            {isOpen && <Box sx={styles.details}>
              {lines.map((line) => <Typography key={line.label + line.value} variant="body2"><Box component="span" sx={styles.detailLabel}>{line.label}</Box>{line.value}</Typography>)}
            </Box>}
          </Box>;
        })}
      </Paper>
    </Box>)}

    {next && <Box sx={styles.more}><Button variant="outlined" color="inherit" onClick={() => void more()} disabled={loadingMore}>
      {loadingMore ? 'Loading…' : 'Show older entries'}</Button></Box>}
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Only the owner can see this page. Details never include PINs, tokens or other secrets.</Typography>
  </Box>;
}
