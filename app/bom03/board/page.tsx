"use client";

import { JobBoard } from "@/components/job-board";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";

export default function AdminBoardPage() {
  const router = useRouter();

  return (
    <Box sx={{ p: { xs: 3, md: 4 }, pb: { xs: 14, md: 4 }, width: "100%", mx: "auto" }}>
      {/* Header */}
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "flex-end" }, justifyContent: "space-between", gap: 2, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <IconButton size="small" onClick={() => router.back()} sx={{ display: { md: "none" }, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
            <ArrowLeft size={16} />
          </IconButton>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>Production Board</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              Track and manage jobs across production stages.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Full-width Job board */}
      <Box sx={{ width: "100%" }}>
        <JobBoard isAdmin={true} />
      </Box>
    </Box>
  );
}
