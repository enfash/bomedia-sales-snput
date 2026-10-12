"use client";

import { useEffect, useState } from 'react';
import { Alert, Box, Paper, Skeleton, Stack, Switch, TextField, Typography } from '@mui/material';

import { approvalRuleStyles as styles, settingsStyles } from '@/app/theme';
import { BackLink } from '@/components/back-link';
import { useFloatingNotice } from '@/components/floating-notice';
import { RULE_INFO, ruleLimit, type ApprovalRuleRow } from '@/lib/approvals-view';

const ENDPOINT = '/api/accounting/approval-rules';
const message = (error: unknown) => (error instanceof Error ? error.message : 'Approval rules could not be saved. Try again.');
// Rules that do something today, then the ones that come in a later step.
const ACTIVE = ['date', 'price'] as const;
const LATER = ['expense_limit', 'edit_old'] as const;

export function ApprovalRulesSettings() {
  const [rules, setRules] = useState<ApprovalRuleRow[] | null>(null);
  const [error, setError] = useState(''), [saved, setSaved] = useState(''), [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function load() {
    const response = await fetch(ENDPOINT, { cache: 'no-store' }), result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result)) throw new Error(result?.error || 'Approval rules could not be loaded.');
    setRules(result);
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => { try { await load(); } catch (cause) { if (active) setError(message(cause)); } });
    return () => { active = false; };
  }, []);
  useFloatingNotice('approval-rules-saved', saved ? { tone: 'success', text: saved } : null);

  const rule = (kind: string) => rules?.find((r) => r.kind === kind);

  async function save(kind: typeof ACTIVE[number], enabled: boolean, limit: number) {
    if (busy) return;
    setBusy(kind); setError(''); setSaved('');
    try {
      const params = kind === 'date' ? { days: limit } : { percent: limit };
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), kind, enabled, params }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'The rule was not saved. Try again.');
      setDrafts((d) => { const { [kind]: _gone, ...rest } = d; return rest; });
      setSaved(`${RULE_INFO[kind].title} ${enabled ? 'is on' : 'is off'}.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(''); }
  }

  return <Box sx={settingsStyles.page}>
    <BackLink href="/bom03/settings" label="Settings" />
    <Stack spacing={1} sx={settingsStyles.heading}>
      <Typography variant="h3" component="h1">Approvals</Typography>
      <Typography color="text.secondary">Choose what staff must ask you about. A sale that matches a rule waits for your decision and is not recorded until you approve it. Anything you enter yourself is never held.</Typography>
    </Stack>
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {!rules && !error && [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={96} />)}
      <Box sx={styles.list}>
        {rules && ACTIVE.map((kind) => {
          const current = rule(kind), info = RULE_INFO[kind], limit = ruleLimit(current);
          const draft = drafts[kind] ?? String(limit), parsed = Number(draft);
          const valid = draft.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= info.max;
          return <Paper key={kind} variant="outlined" sx={styles.row}>
            <Box sx={styles.grow}>
              <Typography variant="h6" component="h2">{info.title}</Typography>
              <Typography variant="body2" color="text.secondary">{info.description}</Typography>
            </Box>
            <Box sx={styles.limit}>
              Allow
              <TextField size="small" type="number" sx={styles.number} value={draft} disabled={busy === kind}
                error={!valid} aria-label={info.fieldLabel}
                onChange={(event) => setDrafts((d) => ({ ...d, [kind]: event.target.value }))}
                onBlur={() => { if (valid && parsed !== limit) void save(kind, current?.enabled ?? false, parsed); }}
                slotProps={{ htmlInput: { min: 0, max: info.max, step: 1, inputMode: 'numeric' } }} />
              {info.unit}
            </Box>
            <Switch checked={current?.enabled ?? false} disabled={busy === kind || !valid} aria-label={`${info.title}: ${current?.enabled ? 'on' : 'off'}`}
              onChange={(_, value) => void save(kind, value, valid ? parsed : limit)} />
          </Paper>;
        })}
        {rules && LATER.map((kind) => <Paper key={kind} variant="outlined" sx={[styles.row, styles.rowLater]}>
          <Box sx={styles.grow}>
            <Typography variant="h6" component="h2">{RULE_INFO[kind].title}</Typography>
            <Typography variant="body2" color="text.secondary">{RULE_INFO[kind].description}</Typography>
          </Box>
          <Box component="span" sx={styles.laterPill}>Coming next</Box>
        </Paper>)}
      </Box>
      <Typography variant="body2" color="text.secondary">Changes are saved as you make them and recorded in the audit log.</Typography>
    </Stack>
  </Box>;
}
