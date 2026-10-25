"use client";

import { Box, TextField, Typography } from '@mui/material';
import { SegmentedControl } from '@/components/segmented-control';
import { choiceStyles as styles } from '@/app/theme';
import { choiceForUnit, LENGTH_UNITS, OTHER_LENGTH, recordedAs, ROLL_LENGTH_PRESETS, rollRawFeet, SETUP_RESERVE_FT, usableFeet, type LengthUnit, type RollLengthChoice } from '@/lib/roll-length';

const feetLabel = (value: number) => `${value.toLocaleString('en-NG', { maximumFractionDigits: 2 })} ft`;

/** Pick the unit, then one of the standard roll lengths (or type another). The books always store feet. */
export function RollLengthPicker({ value, onChange, disabled = false }: { value: RollLengthChoice; onChange: (next: RollLengthChoice) => void; disabled?: boolean }) {
  const presets = ROLL_LENGTH_PRESETS[value.unit];
  const feet = rollRawFeet(value), usable = usableFeet(feet);
  return <Box sx={styles.wrap}>
    <Box component="fieldset" sx={styles.fieldset}>
      <Typography component="legend" sx={styles.legend}>Measure the roll in</Typography>
      <SegmentedControl label="Measure the roll in" disabled={disabled} value={value.unit} options={LENGTH_UNITS}
        onChange={(unit: LengthUnit) => onChange({ unit, choice: choiceForUnit(unit, value.choice), other: value.other })} />
    </Box>
    <Box component="fieldset" sx={styles.fieldset}>
      <Typography component="legend" sx={styles.legend}>Roll length</Typography>
      <SegmentedControl label="Roll length" disabled={disabled} value={value.choice} options={[...presets, { value: OTHER_LENGTH, label: 'Other' }]}
        onChange={(choice) => onChange({ ...value, choice })} />
      {value.choice === OTHER_LENGTH && <TextField label={`Length of each roll (${value.unit === 'm' ? 'm' : 'ft'})`} value={value.other} disabled={disabled}
        onChange={(event) => onChange({ ...value, other: event.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />}
      <Typography variant="caption" sx={styles.hint}>
        {feet ? <>{recordedAs(value)} {usable > 0 ? <>{SETUP_RESERVE_FT} ft is kept back for setup, so <strong>{feetLabel(usable)} is usable</strong> on each roll.</> : `A roll must be longer than ${SETUP_RESERVE_FT} ft.`}</>
          : value.choice === OTHER_LENGTH ? `Enter the length. A roll must be longer than ${SETUP_RESERVE_FT} ft.` : ''}
      </Typography>
    </Box>
  </Box>;
}
