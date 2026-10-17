"use client";

import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import { AlertTriangle, ChevronDown, ChevronUp, Plus, RefreshCw, Ruler, Trash2 } from 'lucide-react';

import { estimatorStyles as styles } from '@/app/theme';
import { BackLink } from '@/components/back-link';
import { SIZE_SHORTCUTS, shortcutLabel, shortcutSize, type DimUnit } from '@/lib/estimator-view';

export function EstimatorHeading({ backHref, backLabel, onRefresh, syncing, refreshLabel }: { backHref: string; backLabel: string; onRefresh: () => void; syncing: boolean; refreshLabel: string }) {
  return <>
    <BackLink href={backHref} label={backLabel} />
    <Box sx={styles.heading}>
      <Stack spacing={0.5}>
        <Typography variant="h3" component="h1">Price Estimator</Typography>
        <Typography color="text.secondary">Build a quote with several items. No sale is logged.</Typography>
      </Stack>
      <IconButton onClick={onRefresh} aria-label={refreshLabel} sx={styles.refresh}><Box component="span" sx={syncing ? styles.spinning : styles.iconBox}><RefreshCw size={18} /></Box></IconButton>
    </Box>
  </>;
}

export function FieldLabel({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <Typography component="div" sx={styles.label}>{icon}{children}</Typography>;
}

export function Notice({ tone, spaced = false, children }: { tone: 'warning' | 'error' | 'success'; spaced?: boolean; children: ReactNode }) {
  return <Box role="status" sx={[tone === 'warning' ? styles.noteWarning : tone === 'error' ? styles.noteError : styles.noteSuccess, ...(spaced ? [styles.noteSpace] : [])]}>
    {tone !== 'success' && <Box component="span" sx={styles.noteIcon}><AlertTriangle size={16} /></Box>}{children}
  </Box>;
}

export function EmptyCard({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <Paper variant="outlined" sx={styles.empty}>{icon}{children}</Paper>;
}

type SizeItem = { width: string; height: string; qty: string; dimUnit: DimUnit; margin?: string };

/** Unit switch, quick sizes and the width / height / quantity (and margin) fields. */
export function SizeFields({ item, onChange, withMargin = false }: { item: SizeItem; onChange: (patch: Partial<SizeItem>) => void; withMargin?: boolean }) {
  const fields = [
    { key: 'width', label: `Width (${item.dimUnit})`, placeholder: item.dimUnit === 'ft' ? '4' : '48' },
    { key: 'height', label: `Height (${item.dimUnit})`, placeholder: item.dimUnit === 'ft' ? '8' : '96' },
    { key: 'qty', label: 'Quantity', placeholder: '1' },
    ...(withMargin ? [{ key: 'margin', label: 'Margin %', placeholder: '0' }] : []),
  ] as const;
  return <Box>
    <Box sx={styles.labelRow}>
      <Typography component="div" sx={styles.labelFlush}><Ruler size={14} /> Size</Typography>
      <Box sx={styles.unitToggle} role="group" aria-label="Unit">
        {(['ft', 'in'] as const).map((unit) => <Button key={unit} size="small" aria-pressed={item.dimUnit === unit} sx={item.dimUnit === unit ? styles.unitButtonOn : styles.unitButton} onClick={() => onChange({ dimUnit: unit })}>{unit}</Button>)}
      </Box>
    </Box>
    <Box sx={styles.shortcuts}>
      {SIZE_SHORTCUTS.map((shortcut) => <Button key={shortcutLabel(shortcut)} size="small" variant="outlined" sx={styles.shortcut} onClick={() => onChange(shortcutSize(shortcut, item.dimUnit))}>{shortcutLabel(shortcut)}</Button>)}
    </Box>
    <Box sx={withMargin ? styles.fields4 : styles.fields3}>
      {fields.map(({ key, label, placeholder }) => <TextField key={key} fullWidth type="number" size="small" label={label} placeholder={placeholder} value={item[key as keyof SizeItem] ?? ''}
        onChange={(event) => onChange({ [key]: event.target.value })} slotProps={{ htmlInput: { min: key === 'qty' ? 1 : undefined } }} sx={styles.fieldNumber} />)}
    </Box>
  </Box>;
}

export function ResultTiles({ tiles }: { tiles: { label: string; value: string; accent?: boolean }[] }) {
  return <Box sx={tiles.length === 4 ? styles.tiles4 : styles.tiles3}>
    {tiles.map((tile) => <Paper key={tile.label} variant="outlined" sx={tile.accent ? styles.tileAccent : styles.tile}>
      <Typography component="div" sx={tile.accent ? styles.tileLabelAccent : styles.tileLabel}>{tile.label}</Typography>
      <Typography sx={styles.tileValue}>{tile.value}</Typography>
    </Paper>)}
  </Box>;
}

/** The collapsible card around one quote item: number, name, price when closed, remove and open/close. */
export function ItemCard({ index, title, summary, money, open, canRemove, onToggle, onRemove, children }: {
  index: number; title: string; summary?: ReactNode; money?: string; open: boolean; canRemove: boolean; onToggle: () => void; onRemove: () => void; children: ReactNode;
}) {
  return <Paper variant="outlined" sx={styles.itemCard}>
    <Box role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); } }} sx={styles.itemHead}>
      <Box sx={styles.itemBadge}>{index + 1}</Box>
      <Box sx={styles.itemText}>
        <Typography noWrap sx={styles.itemTitle}>{title}</Typography>
        {!open && summary && <Typography variant="body2" sx={styles.itemSummary}>{summary}</Typography>}
      </Box>
      {money && <Typography sx={styles.itemMoney}>{money}</Typography>}
      {canRemove && <IconButton size="small" aria-label={`Remove item ${index + 1}`} onClick={(event) => { event.stopPropagation(); onRemove(); }} sx={styles.removeButton}><Trash2 size={16} /></IconButton>}
      <Box component="span" sx={styles.itemChevron}>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</Box>
    </Box>
    {open && <Box sx={styles.itemBody}>{children}</Box>}
  </Paper>;
}

export function AddItemButton({ onClick }: { onClick: () => void }) {
  return <Button variant="outlined" onClick={onClick} startIcon={<Plus size={16} />} sx={styles.addItem}>Add another item</Button>;
}

export function QuoteSummary({ total, count, breakdown, children }: { total: string; count: number; breakdown: { id: string; label: string; money: string }[]; children: ReactNode }) {
  return <Paper variant="outlined" sx={styles.summary}>
    <Box sx={styles.summaryTotal}>
      <Typography variant="overline" color="text.secondary">{count > 1 ? 'Grand total' : 'Total'}</Typography>
      <Typography variant="h4" component="p" sx={styles.summaryAmount}>{total}</Typography>
    </Box>
    {children}
    {breakdown.length > 1 && <Box sx={styles.breakdown}>
      {breakdown.map((row) => <Box key={row.id} sx={styles.breakdownRow}><Typography variant="body2" color="text.secondary">{row.label}</Typography><Typography variant="body2" sx={styles.strong}>{row.money}</Typography></Box>)}
    </Box>}
  </Paper>;
}

export function LinkCta({ href, onClick, title, note, children }: { href?: string; onClick?: () => void; title: string; note: string; children?: ReactNode }) {
  const content = <><Box><Typography sx={styles.strong}>{title}</Typography><Typography variant="body2" sx={styles.ctaNote}>{note}</Typography></Box>{children}</>;
  return href ? <Paper component={NextLink} href={href} sx={styles.cta}>{content}</Paper> : <Paper component="button" type="button" onClick={onClick} sx={styles.cta}>{content}</Paper>;
}
