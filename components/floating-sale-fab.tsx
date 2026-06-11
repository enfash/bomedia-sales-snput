"use client";

import { Plus } from "lucide-react";
import { Fab, Box } from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";

const BOTTOM_NAV_HANDLES_NEW_ENTRY = [
  "/cashier",
  "/cashier/records",
  "/cashier/expenses",
  "/cashier/board",
  "/new-entry",
];

export function FloatingSaleActionButton() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/bom03");

  const isHandledByBottomNav = BOTTOM_NAV_HANDLES_NEW_ENTRY.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  );

  if (isHandledByBottomNav && !isAdmin) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 40,
        display: { xs: "block", md: "none" },
      }}
    >
      <Link href="/new-entry">
        <Fab
          sx={{
            width: 56,
            height: 56,
            bgcolor: isAdmin ? "primary.main" : "warning.main",
            color: "white",
            border: "4px solid",
            borderColor: "background.paper",
            boxShadow: isAdmin
              ? "0 8px 32px rgba(200,71,46,0.4)"
              : "0 8px 32px rgba(232,161,58,0.4)",
            "&:hover": {
              bgcolor: isAdmin ? "primary.dark" : "warning.dark",
              transform: "scale(1.1)",
            },
            "&:active": {
              transform: "scale(0.97)",
            },
            transition: "background-color 0.2s, transform 0.15s",
          }}
        >
          <Plus size={32} />
        </Fab>
      </Link>
    </Box>
  );
}
