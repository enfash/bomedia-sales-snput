"use client";
import { SalesEntry } from "@/components/sales-entry";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

export default function AdminNewEntryPage() {
  return (
    <Box sx={{p: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 }, minHeight: "100vh"}}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <IconButton
            component={Link}
            href="/bom03"
            size="small"
            sx={{
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <ArrowLeft size={16} />
          </IconButton>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
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
