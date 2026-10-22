import { Box, Typography } from '@mui/material';
import { statTileStyles as styles } from '@/app/theme';

type Tone = 'neutral' | 'success' | 'warning' | 'primary' | 'error';

/** A labelled number. `wide` lays the label and value side by side (for a headline total); `compact` is the small version that lets three sit in one row on a phone. */
export function StatTile({ label, value, tone = 'neutral', wide = false, compact = false, caption }: { label: string; value: string | number; tone?: Tone; wide?: boolean; compact?: boolean; caption?: string }) {
  return <Box sx={[styles.tile, compact && styles.tileCompact, tone !== 'neutral' && styles[tone], wide && styles.wide]}>
    <Typography variant="overline" sx={[styles.label, compact && styles.labelCompact]}>{label}</Typography>
    <Typography variant={wide ? 'h5' : 'h6'} component="p" sx={[styles.value, compact && styles.valueCompact]}>{value}</Typography>
    {caption && <Typography variant="caption" color="text.secondary" sx={compact ? styles.captionCompact : undefined}>{caption}</Typography>}
  </Box>;
}
