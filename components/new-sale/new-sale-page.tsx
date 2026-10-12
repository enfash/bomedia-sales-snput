"use client";

import { Box, Typography } from "@mui/material";
import { newSaleStyles as styles } from "@/app/theme";
import { HomeBackLink } from "@/components/back-link";
import { SalesEntry } from "@/components/sales-entry";

/** The New Sale page for both roles: back link, heading, then the entry form. */
export function NewSalePage() {
  return <Box sx={styles.screen}>
    <HomeBackLink />
    <Box sx={styles.heading}>
      <Typography variant="h3" component="h1">New sale</Typography>
      <Typography color="text.secondary">Add the customer’s items, then review and save.</Typography>
    </Box>
    <SalesEntry />
  </Box>;
}
