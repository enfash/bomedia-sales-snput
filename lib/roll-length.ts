// Standard roll lengths and how a chosen length becomes the exact feet the books store. Pure: no screen, no network.
export type LengthUnit = 'm' | 'ft';
/** Feet kept back from every new roll for setup, so a 164 ft roll has 154 ft usable. */
export const SETUP_RESERVE_FT = 10;
export const OTHER_LENGTH = 'other';
export const LENGTH_UNITS: ReadonlyArray<{ value: LengthUnit; label: string }> = [
  { value: 'm', label: 'Meters (M)' },
  { value: 'ft', label: 'Feet (ft)' },
];
/** The rolls suppliers actually sell. A 50 M roll is recorded as exactly 164 ft and a 100 M roll as 328 ft. */
export const ROLL_LENGTH_PRESETS: Record<LengthUnit, ReadonlyArray<{ value: string; label: string; feet: string }>> = {
  m: [{ value: '50', label: '50 M', feet: '164' }, { value: '100', label: '100 M', feet: '328' }],
  ft: [{ value: '164', label: '164 ft', feet: '164' }, { value: '328', label: '328 ft', feet: '328' }],
};
export const DEFAULT_ROLL_LENGTH: RollLengthChoice = { unit: 'm', choice: '50', other: '' };

export type RollLengthChoice = { unit: LengthUnit; choice: string; other: string };

const FEET_PATTERN = /^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/;
const METERS_TO_FEET = 3.28084; // only for a typed "Other" length in meters

/** The preset choice for a unit, or the first preset when the old choice does not exist in the new unit. */
export function choiceForUnit(unit: LengthUnit, previous: string): string {
  const presets = ROLL_LENGTH_PRESETS[unit];
  return previous === OTHER_LENGTH || presets.some((preset) => preset.value === previous) ? previous : presets[0].value;
}

/** Exact feet to store (as text), or null while the length is missing or invalid. */
export function rollRawFeet({ unit, choice, other }: RollLengthChoice): string | null {
  if (choice !== OTHER_LENGTH) return ROLL_LENGTH_PRESETS[unit].find((preset) => preset.value === choice)?.feet ?? null;
  const typed = other.trim();
  if (!FEET_PATTERN.test(typed) || Number(typed) <= 0) return null;
  const feet = unit === 'm' ? Math.round(Number(typed) * METERS_TO_FEET * 100) / 100 : Number(typed);
  return feet > 0 ? String(feet) : null;
}

/** Feet left to sell on each roll after the setup reserve; 0 when the roll is no longer than the reserve. */
export function usableFeet(rawFeet: string | null): number {
  if (!rawFeet) return 0;
  const raw = Number(rawFeet);
  return raw > SETUP_RESERVE_FT ? Math.round((raw - SETUP_RESERVE_FT) * 1000) / 1000 : 0;
}

/** Plain-words line saying what will be recorded, e.g. "50 M is recorded as 164 ft." */
export function recordedAs(choice: RollLengthChoice): string {
  const feet = rollRawFeet(choice);
  if (!feet) return '';
  if (choice.choice !== OTHER_LENGTH) {
    const preset = ROLL_LENGTH_PRESETS[choice.unit].find((item) => item.value === choice.choice);
    return choice.unit === 'm' ? `${preset?.label} is recorded as ${feet} ft.` : `${preset?.label} is recorded as it is.`;
  }
  return choice.unit === 'm' ? `${choice.other.trim()} M is recorded as about ${feet} ft.` : `${feet} ft is recorded as it is.`;
}
