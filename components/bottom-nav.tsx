"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, BarChart3, PlusCircle,
  KanbanSquare, Package, Users, Calculator,
} from "lucide-react";
import { useTheme } from "@mui/material/styles";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Fab from "@mui/material/Fab";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isAdmin = pathname?.startsWith("/bom03");
  const isCashier = pathname?.startsWith("/cashier") || isAdmin;

  if (!isCashier) return null;
  if (pathname === "/bom03/login" || pathname === "/cashier/login") return null;
  if (pathname?.endsWith("/new-entry")) return null;

  const navItems = isAdmin
    ? [
        { label: "Dash",  icon: LayoutDashboard, href: "/bom03" },
        { label: "Board", icon: KanbanSquare,    href: "/bom03/board" },
        { label: "New",   icon: PlusCircle,      href: "/bom03/new-entry", primary: true },
        { label: "Stock", icon: Package,         href: "/bom03/inventory" },
        { label: "Staff", icon: Users,           href: "/bom03/staff" },
      ]
    : [
        { label: "Home",    icon: LayoutDashboard, href: "/cashier" },
        { label: "Quote",   icon: Calculator,      href: "/cashier/estimator" },
        { label: "New",     icon: PlusCircle,      href: "/cashier/new-entry", primary: true },
        { label: "Board",   icon: KanbanSquare,    href: "/cashier/board" },
        { label: "Records", icon: BarChart3,       href: "/cashier/records" },
      ];

  const getActiveValue = () => {
    const match = navItems.find((item) =>
      item.primary ? false :
      pathname === item.href ||
      (item.href !== "/cashier" && item.href !== "/bom03" && pathname?.startsWith(item.href))
    );
    return match?.href ?? false;
  };

  return (
    <Box
      sx={{
        display: { md: "none" },
        position: "fixed",
        bottom: 24,
        left: 0,
        right: 0,
        zIndex: "appBar",
        px: 2,
        pointerEvents: "none",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 448,
          mx: "auto",
          borderRadius: "2rem",
          border: "1px solid",
          borderColor: isAdmin
            ? theme.palette.mode === "dark"
              ? "rgba(46,56,141,0.3)"
              : "rgba(46,56,141,0.15)"
            : "rgba(255,255,255,0.4)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
          backdropFilter: "blur(20px)",
          bgcolor: theme.palette.mode === "dark" ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.9)",
          pointerEvents: "auto",
          overflow: "visible",
        }}
      >
        <BottomNavigation
          value={getActiveValue()}
          sx={{
            bgcolor: "transparent",
            borderRadius: "2rem",
            height: 64,
            alignItems: "center",
            px: 0.5,
            overflow: "visible",
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.primary) {
              return (
                <Box
                  key={item.href}
                  component={({ showLabel, value, onChange, ...props }: any) => <Link {...props} />}
                  href={item.href}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                    transform: "translateY(-20px)",
                    textDecoration: "none",
                    flex: 1,
                  }}
                >
                  <Fab
                    color="primary"
                    size="large"
                    component="span"
                    aria-label="New entry"
                    sx={{
                      width: 56,
                      height: 56,
                      border: "4px solid",
                      borderColor: "background.default",
                      boxShadow: isAdmin
                        ? "0 8px 20px rgba(46,56,141,0.4)"
                        : "0 8px 20px rgba(247,104,8,0.45)",
                    }}
                  >
                    <PlusCircle size={28} />
                  </Fab>
                  <Box
                    component="span"
                    sx={{
                      fontSize: "0.5625rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "primary.main",
                      mt: -0.5,
                    }}
                  >
                    {item.label}
                  </Box>
                </Box>
              );
            }

            const isActive =
              pathname === item.href ||
              (item.href !== "/cashier" && item.href !== "/bom03" && pathname?.startsWith(item.href));

            return (
              <BottomNavigationAction
                key={item.href}
                label={item.label}
                value={item.href}
                icon={<Icon size={20} strokeWidth={isActive ? 2.5 : 2} />}
                onClick={() => router.push(item.href)}
                sx={{
                  minWidth: 0,
                  color: isActive
                    ? "primary.main"
                    : "text.secondary",
                  "& .MuiBottomNavigationAction-label": {
                    fontSize: "0.5625rem",
                    fontWeight: isActive ? 700 : 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    opacity: "1 !important", // override MUI's opacity-0 when showLabels is off
                  },
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                  transition: "transform 0.15s ease, color 0.15s ease",
                }}
              />
            );
          })}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
