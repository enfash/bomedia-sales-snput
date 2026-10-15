"use client";

import { Box } from "@mui/material";
import { usePathname } from "next/navigation";

import { loadingStyles } from "@/app/theme";
import { LoadingState, type Piece } from "@/components/loading-state";

export type LoadingRole = "admin" | "cashier";

/**
 * The loading look of each screen, per role. The owner and the cashier see different screens (the owner has filters, charts and more tiles),
 * so each role gets a shape that matches what will appear. To change how a screen loads, edit its list here, nowhere else.
 * `shared` is used when both roles see the same layout.
 */
type Layout = { admin: Piece[]; cashier: Piece[] } | { shared: Piece[] };

const SCREENS = {
  dashboard: {
    admin: [{ k: "eyebrow" }, { k: "pills", n: 5 }, { k: "wide" }, { k: "banner" }, { k: "chart" }, { k: "tiles", n: 4, cols: 2 }, { k: "tiles", n: 2, cols: 2 }, { k: "list", n: 4 }],
    cashier: [{ k: "hero" }, { k: "actions" }, { k: "cards", n: 1 }, { k: "list", n: 3 }],
  },
  records: {
    admin: [{ k: "heading" }, { k: "wide" }, { k: "tiles", n: 4, cols: 2 }, { k: "pills", n: 4 }, { k: "search" }, { k: "pills", n: 3 }, { k: "list", n: 6 }],
    cashier: [{ k: "heading" }, { k: "wide" }, { k: "pills", n: 4 }, { k: "search" }, { k: "list", n: 6 }],
  },
  expenses: {
    admin: [{ k: "heading" }, { k: "wide" }, { k: "tiles", n: 3, cols: "wide-first" }, { k: "search" }, { k: "pills", n: 3 }, { k: "list", n: 6 }],
    cashier: [{ k: "heading" }, { k: "list", n: 4 }],
  },
  customers: {
    admin: [{ k: "heading" }, { k: "tiles", n: 4, cols: 2 }, { k: "search" }, { k: "list", n: 6 }],
    cashier: [{ k: "heading" }, { k: "tiles", n: 2, cols: 2 }, { k: "search" }, { k: "list", n: 6 }],
  },
  staff: { shared: [{ k: "heading" }, { k: "list", n: 6 }] },
  stock: {
    admin: [{ k: "heading" }, { k: "tiles", n: 3, cols: 3 }, { k: "cards", n: 4 }],
    cashier: [{ k: "heading" }, { k: "cards", n: 4 }],
  },
  settings: { shared: [{ k: "heading" }, { k: "cards", n: 4 }] },
  generic: { shared: [{ k: "heading" }, { k: "tiles", n: 4 }, { k: "list", n: 5 }] },
} satisfies Record<string, Layout>;

export type LoadingScreen = keyof typeof SCREENS;

/** The signed-in area decides the role: /bom03 is the owner, everything else the cashier. Pass `role` only to override. */
export function ScreenLoading({ screen, role, label = "Loading" }: { screen: LoadingScreen; role?: LoadingRole; label?: string }) {
  const pathname = usePathname() ?? "";
  const who: LoadingRole = role ?? (pathname.startsWith("/bom03") ? "admin" : "cashier");
  const layout: Layout = SCREENS[screen];
  const pieces = "shared" in layout ? layout.shared : layout[who];
  return <Box sx={loadingStyles.pagePad}><LoadingState pieces={pieces} label={label} /></Box>;
}
