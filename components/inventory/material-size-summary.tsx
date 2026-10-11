import { Box, Typography } from '@mui/material';
import { materialsStyles, inventoryStyles as styles, systemStatusStyles as status } from '@/app/theme';
import { feetText, toNumber, type FeedRow } from '@/lib/inventory-summary';

export const statusTone = (value: string) => (value === 'Active' ? materialsStyles.chipOn : value === 'Low Stock' || value === 'Out of Stock' ? status.chipWarn : materialsStyles.chipOff);
export const barColor = (value: string) => (value === 'Active' ? 'success' : value === 'Low Stock' ? 'warning' : 'inherit') as 'success' | 'warning' | 'inherit';

/**
 * The top of a material-size card: name, width, code and status, then how much is left. The owner's Inventory and the cashier's
 * Stock check share it, so a size reads the same on both. A cashier is told "Available" and sees only the feet left.
 */
export function MaterialSizeSummary({ row, forCashier = false }: { row: FeedRow; forCashier?: boolean }) {
  const off = row.Available === 'No', rollCount = toNumber(row['Roll Count']);
  return <>
    <Box sx={styles.titleLine}>
      <Box>
        <Typography variant="h6" component="h2" sx={styles.name}>{row['Material Name']} <Typography component="span" sx={styles.width}>· {Number(row['Width (ft)'])} ft wide</Typography></Typography>
        <Typography variant="caption" sx={styles.code}>{row['Material ID']}</Typography>
      </Box>
      <Box sx={styles.chips}>
        {off && <Box component="span" sx={[status.chip, materialsStyles.chipOff]}>Turned off</Box>}
        <Box component="span" sx={[status.chip, statusTone(row.Status)]}>{forCashier && row.Status === 'Active' ? 'Available' : row.Status}</Box>
      </Box>
    </Box>
    <Box sx={status.line}>
      <Typography variant="body2" color="text.secondary">{forCashier ? 'Left' : rollCount === 0 ? 'No rolls yet' : `${rollCount} roll${rollCount === 1 ? '' : 's'}`}</Typography>
      <Typography sx={styles.strong}>{feetText(toNumber(row['Total Remaining (ft)']))}{forCashier ? '' : ' left'}</Typography>
    </Box>
  </>;
}
