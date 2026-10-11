"use client";

import { HomeBackLink } from "@/components/back-link";
import { JobBoard } from "@/components/job-board";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function CashierBoardPage() {
  return (
    <Box sx={{ p: { xs: 3, md: 4 }, pb: { xs: 3, md: 4 }, width: "100%", mx: "auto" }}>
      <HomeBackLink />
      {/* Header */}
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "flex-end" }, justifyContent: "space-between", gap: 2, mb: 4 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>Job Board</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            Track sales jobs through production.
          </Typography>
        </Box>
      </Box>

      {/* Full-width Job board */}
      <Box sx={{ width: "100%" }}>
        <JobBoard isAdmin={false} />
      </Box>
    </Box>
  );
}
