"use client";

import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCashier = pathname?.startsWith("/cashier");

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        transition: "background-color 0.5s",
        bgcolor: "background.default",
      }}
    >
      {children}
    </Box>
  );
}
