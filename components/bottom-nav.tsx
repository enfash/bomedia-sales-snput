"use client";

import { useEffect, useState } from "react";
import { shellVisible } from "@/lib/session-view";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BarChart3, Plus,
  KanbanSquare, Package, Calculator,
} from "lucide-react";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Fab from "@mui/material/Fab";
import { bottomNavStyles as styles } from "@/app/theme";

type NavItem = { label: string; icon: LucideIcon; href: string; primary?: boolean };

const ADMIN_ITEMS: NavItem[] = [
  { label: "Dash", icon: LayoutDashboard, href: "/bom03" },
  { label: "Board", icon: KanbanSquare, href: "/bom03/board" },
  { label: "New entry", icon: Plus, href: "/bom03/new-entry", primary: true },
  { label: "Stock", icon: Package, href: "/bom03/inventory" },
  { label: "Records", icon: BarChart3, href: "/bom03/records" },
];
const CASHIER_ITEMS: NavItem[] = [
  { label: "Home", icon: LayoutDashboard, href: "/cashier" },
  { label: "Quote", icon: Calculator, href: "/cashier/estimator" },
  { label: "New entry", icon: Plus, href: "/cashier/new-entry", primary: true },
  { label: "Board", icon: KanbanSquare, href: "/cashier/board" },
  { label: "Records", icon: BarChart3, href: "/cashier/records" },
];

// Slides away while scrolling down a list and returns on scroll up, so it never sits over amounts. Resets on every page change.
const HIDE_AFTER_PX = 80;
const MOVE_THRESHOLD_PX = 8;

function useHideOnScroll(pathname: string | null) {
  const [state, setState] = useState<{ path: string | null; hidden: boolean }>({ path: pathname, hidden: false });
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const now = window.scrollY;
      if (Math.abs(now - last) < MOVE_THRESHOLD_PX) return;
      const nearBottom = window.innerHeight + now >= document.documentElement.scrollHeight - 24;
      const hidden = now > last && now > HIDE_AFTER_PX && !nearBottom;
      last = now;
      setState((current) => (current.path === pathname && current.hidden === hidden ? current : { path: pathname, hidden }));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);
  return state.path === pathname && state.hidden;
}

export function BottomNav() {
  const pathname = usePathname();
  const hidden = useHideOnScroll(pathname);
  const isAdmin = !!pathname?.startsWith("/bom03");
  const isCashier = pathname?.startsWith("/cashier") || isAdmin;

  if (!isCashier) return null;
  if (!shellVisible(pathname)) return null;
  if (pathname?.endsWith("/new-entry")) return null;

  const items = isAdmin ? ADMIN_ITEMS : CASHIER_ITEMS;
  const isActive = (item: NavItem) =>
    pathname === item.href || (item.href !== "/cashier" && item.href !== "/bom03" && !!pathname?.startsWith(item.href));

  return (
    <>
      <Box aria-hidden sx={styles.spacer} />
      <Box component="nav" aria-label="Main" sx={[styles.wrap, hidden && styles.wrapHidden]}>
        <Box sx={[styles.bar, isAdmin ? styles.barAdmin : styles.barCashier]}>
          {items.map((item) => {
            const Icon = item.icon;
            if (item.primary) {
              return (
                <Box key={item.href} component={Link} href={item.href} aria-label={item.label} sx={styles.newSlot}>
                  <Fab color="primary" size="large" component="span" aria-hidden sx={styles.fab}>
                    <Icon size={28} />
                  </Fab>
                </Box>
              );
            }
            const active = isActive(item);
            return (
              <ButtonBase
                key={item.href}
                component={Link}
                href={item.href}
                disableRipple
                aria-current={active ? "page" : undefined}
                // Tapping the tab you are already on scrolls back to the top instead of reloading the page.
                onClick={(event) => {
                  if (pathname === item.href) {
                    event.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                sx={[styles.tab, active && styles.tabActive]}
              >
                <Box className="bottom-nav-icon" sx={styles.tabIcon}>
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden />
                </Box>
                <Box component="span" sx={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Box>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>
    </>
  );
}
