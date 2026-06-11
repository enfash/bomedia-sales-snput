"use client";

import { Box, Typography } from "@mui/material";
import { SalesEntry } from "@/components/sales-entry";
import { PlusCircle } from "lucide-react";

export default function NewEntryPage() {
  return (
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 }}}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900, color: "text.primary", mb: 0.5 }}>
          Log New Sale Entry
        </Typography>
        <Typography sx={{ color: "text.secondary" }}>
          Log a new print job using manual entry or AI natural language.
        </Typography>
      </Box>
      <SalesEntry />
    </Box>
  );
}
