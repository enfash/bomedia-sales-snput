import { createElement } from 'react';
import Typography from '@mui/material/Typography';

export function CustomerHistoryLimit({ total, returned }: { total: number; returned: number }) {
  if (total <= returned) return null;
  return createElement(Typography, { variant: 'body2', color: 'text.secondary' }, `Showing the latest ${returned} sales (${total} in total).`);
}
