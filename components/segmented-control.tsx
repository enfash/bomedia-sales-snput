"use client";

import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { segmentedStyles as styles } from '@/app/theme';

/** The one control for choosing between a few short options of a single setting (a unit, a length, a payment method). Always exactly one stays chosen. */
export function SegmentedControl<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <ToggleButtonGroup exclusive fullWidth color="primary" aria-label={label} value={value} disabled={disabled} sx={styles.group}
    onChange={(_, next: T | null) => { if (next !== null) onChange(next); }}>
    {options.map((option) => <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>)}
  </ToggleButtonGroup>;
}
