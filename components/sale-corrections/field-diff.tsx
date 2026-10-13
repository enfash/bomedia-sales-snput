"use client";

import { Box, Typography } from '@mui/material';

import { customerStyles as diffStyles } from '@/app/theme';
import { koboNaira } from '@/lib/approvals-view';

const LABEL: Record<string, string> = { description: 'Job', quantity: 'Quantity', width_ft: 'Width (ft)', height_ft: 'Height (ft)', price_per_sqft_kobo: 'Price per sq ft', amount_kobo: 'Total', material: 'Material', business_date: 'Date', status: 'Status' };
export const EXPENSE_LABELS: Record<string, string> = { amount_kobo: 'Amount', category: 'Category', description: 'Note', paid_to: 'Paid to', business_date: 'Date', status: 'Status' };
const MONEY = new Set(['amount_kobo', 'price_per_sqft_kobo']);
const SKIP = new Set(['material_id']);
const show = (key: string, value: unknown) => (value === null || value === undefined || value === '' ? '' : MONEY.has(key) ? koboNaira(Number(value) || 0) : String(value));

const differing = (before: Record<string, unknown>, after: Record<string, unknown>) => Object.keys(after).filter((key) => !SKIP.has(key) && String(after[key]) !== String(before[key]));
export const hasFieldChanges = (before: Record<string, unknown>, after: Record<string, unknown>) => differing(before, after).length > 0;

/** Each field that differs between two versions of a job, old value struck through, then the new one. */
export function FieldDiff({ before, after, labels = LABEL }: { before: Record<string, unknown>; after: Record<string, unknown>; labels?: Record<string, string> }) {
  return <>{differing(before, after).map((key) => <Box key={key} sx={diffStyles.diff}>
    <Typography variant="body2" color="text.secondary">{labels[key] ?? key}</Typography>
    {show(key, before[key]) ? <Box component="span" sx={diffStyles.diffOld}>{show(key, before[key])}</Box> : <Box component="span" sx={diffStyles.diffEmpty}>Empty</Box>}
    <Box component="span" aria-hidden>→</Box>
    {show(key, after[key]) ? <Box component="span" sx={diffStyles.diffNew}>{show(key, after[key])}</Box> : <Box component="span" sx={diffStyles.diffEmpty}>Empty</Box>}
  </Box>)}</>;
}
