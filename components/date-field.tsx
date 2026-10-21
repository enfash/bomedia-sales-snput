"use client";

import dayjs from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

/**
 * The one date field for forms: shown as DD/MM/YYYY on every phone and computer, whatever its own language setting is.
 * It reads and gives back a plain `YYYY-MM-DD` text (or '' when empty), the same as the browser's own date input did.
 */
export function DateField({ label, value, onChange, disabled = false, required = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean }) {
  const parsed = value ? dayjs(value) : null;
  return <DatePicker label={label} value={parsed?.isValid() ? parsed : null} disabled={disabled} format="DD/MM/YYYY"
    onChange={(next, context) => { if (!next) onChange(''); else if (!context.validationError) onChange(next.format('YYYY-MM-DD')); }}
    slotProps={{ textField: { fullWidth: true, required } }} />;
}
