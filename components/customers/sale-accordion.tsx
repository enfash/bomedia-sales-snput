"use client";

import { useState } from 'react';
import NextLink from 'next/link';
import { Box, ButtonBase, Collapse, Typography } from '@mui/material';
import { ChevronDown } from 'lucide-react';

import { customerStyles as styles } from '@/app/theme';
import { inSheetOrder, itemCount, saleItem } from '@/lib/customer-sale-items';
import { dayLabel, shortNaira } from '@/lib/customers-view';
import type { CustomerProfile } from '@/lib/server/customers';

type Sale = CustomerProfile['sales'][number];

/** The Sales tab: one line per order (Sales ID, date, items, total, owes). Tapping it lists the order's items with their sizes. */
export function SaleAccordion({ sales, base, money }: { sales: Sale[]; base: string; money: (kobo: string) => string }) {
  const [open, setOpen] = useState<string | null>(null);
  return <Box sx={styles.orders}>
    {sales.map((sale) => {
      const isOpen = open === sale.sales_id, owes = Number(sale.owed_kobo) > 0, panel = `order-${sale.sales_id}`;
      const items = inSheetOrder(sale.items ?? []).map(saleItem);
      return <Box key={sale.sales_id} sx={styles.order}>
        <ButtonBase onClick={() => setOpen(isOpen ? null : sale.sales_id)} aria-expanded={isOpen} aria-controls={panel} sx={[styles.orderHead, isOpen && styles.orderHeadOpen]}>
          <Box sx={styles.lineMain}>
            <Typography sx={[styles.lineName, styles.ref, { color: 'text.primary' }]}>{sale.sales_id}</Typography>
            <Typography variant="body2" color="text.secondary">{dayLabel(sale.date)} · {itemCount(sale.jobs)}</Typography>
          </Box>
          <Box sx={styles.lineEnd}>
            <Typography sx={{ fontWeight: 700 }}>{money(sale.total_kobo)}</Typography>
            <Box component="span" sx={[styles.tag, owes ? styles.tagOwes : styles.tagPaid]}>{owes ? `Owes ${shortNaira(Number(sale.owed_kobo))}` : 'Paid'}</Box>
          </Box>
          <Box component="span" sx={[styles.orderChevron, isOpen && styles.orderChevronOpen]} aria-hidden="true"><ChevronDown size={18} /></Box>
        </ButtonBase>
        <Collapse in={isOpen} unmountOnExit>
          <Box id={panel} sx={styles.orderBody}>
            {items.length ? items.map((item, index) => <Box key={index} sx={styles.orderItem}>
              <Box sx={styles.orderItemMain}>
                <Typography sx={styles.orderItemName}>{item.name}</Typography>
                {item.size && <Typography variant="body2" color="text.secondary">{item.size}</Typography>}
              </Box>
              <Typography sx={{ fontWeight: 600, flexShrink: 0 }}>{item.amount}</Typography>
            </Box>) : <Typography variant="body2" color="text.secondary" sx={{ py: 1.25 }}>{sale.what || 'No item details.'}</Typography>}
            <Box component={NextLink} href={`${base}/records?open=${encodeURIComponent(sale.sales_id)}`} sx={styles.orderLink}>Open this sale in Records →</Box>
          </Box>
        </Collapse>
      </Box>;
    })}
  </Box>;
}
