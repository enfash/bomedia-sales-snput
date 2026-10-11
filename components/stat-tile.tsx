import { Box, Typography } from '@mui/material';
import { statTileStyles as styles } from '@/app/theme';

type Tone = 'neutral' | 'success' | 'warning' | 'primary';

/** A labelled number. `wide` lays the label and value side by side (for a headline total). */
export function StatTile({ label, value, tone = 'neutral', wide = false, caption }: { label: string; value: string | number; tone?: Tone; wide?: boolean; caption?: string }) {
  return <Box sx={[styles.tile, tone !== 'neutral' && styles[tone], wide && styles.wide]}>
    <Typography variant="overline" sx={styles.label}>{label}</Typography>
    <Typography variant={wide ? 'h5' : 'h6'} component="p" sx={styles.value}>{value}</Typography>
    {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
  </Box>;
}
