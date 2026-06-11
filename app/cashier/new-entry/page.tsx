"use client";

import { SalesEntry } from "@/components/sales-entry";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

export default function CashierNewEntryPage() {
  const router = useRouter();

  return (
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 }, minHeight: "100vh"}}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <IconButton
            onClick={() => router.back()}
            size="small"
            sx={{
              display: { md: "none" },
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "10px",
            }}
          >
            <ArrowLeft size={16} />
          </IconButton>
          <Box>
            <Typography variant="h3" sx={{ color: "primary.main", fontWeight: 800 }}>
              Log New Sale
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              Log a new print job for a customer.
            </Typography>
          </Box>
        </Box>
      </Box>
      <SalesEntry />
    </Box>
  );
}
