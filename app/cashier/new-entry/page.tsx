"use client";

import { HomeBackLink } from "@/components/back-link";
import { SalesEntry } from "@/components/sales-entry";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function CashierNewEntryPage() {
  return (
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 }, minHeight: "100vh"}}>
      <HomeBackLink />
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box>
            <Typography variant="h3" sx={{ color: "primary.main", fontWeight: 800 }}>
              Log New Sale
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              Add the customer’s items and record any initial payment.
            </Typography>
          </Box>
        </Box>
      </Box>
      <SalesEntry />
    </Box>
  );
}
