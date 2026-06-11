"use client";

import Link from "next/link";
import Image from "next/image";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function LandingPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", p: 2, bgcolor: "background.default" }}>
      <Paper variant="outlined" sx={{ maxWidth: 448, width: "100%", p: 4, borderRadius: 3, textAlign: "center" }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, mb: 4 }}>
          <Paper variant="outlined" sx={{ width: 64, height: 64, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={64} height={64} style={{ objectFit: "contain" }} />
          </Paper>
          <Typography variant="h3" sx={{ fontWeight: 700 }}>
            Welcome to Broad Options Media
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary" }}>
            Sales Daily Recording System
          </Typography>
        </Box>
        <Button component={Link} href="/cashier" variant="contained" fullWidth size="large" sx={{ height: 56, fontSize: "1.125rem" }}>
          Start Recording (Cashier)
        </Button>
      </Paper>
    </Box>
  );
}
