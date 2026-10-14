"use client";

import { shellVisible } from "@/lib/session-view";
import { clearSavedPages } from "@/components/session-guard";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ownerSettingsNav } from "@/components/settings-navigation";
import { accent, headerHomeLinkStyles, syncIconStyles, whiteTint } from "@/app/theme";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu, LayoutDashboard, PlusCircle, Receipt, BarChart3,
  Cloud, CloudOff, RefreshCw, LogOut, Users, KanbanSquare,
  Package, Volume2, VolumeX, Ruler, ArrowLeftRight, Calculator, ShieldCheck,
} from "lucide-react";
import Tooltip from "@mui/material/Tooltip";
import { useSyncStore } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { toast } from "sonner";
import { ActivityFeed } from "./activity-feed";

import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";

interface MobileNavProps {
  isAdmin?: boolean;
}

export function MobileNav({ isAdmin = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { pendingQueue, syncStatus } = useSyncStore();

  useEffect(() => {
    const savedMute = localStorage.getItem("bomedia-muted") === "true";
    setIsMuted(savedMute);
    setHasHydrated(true);
  }, []);

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    localStorage.setItem("bomedia-muted", String(nextMute));
    toast.info(nextMute ? "Notifications Muted" : "Sound Enabled", {
      icon: nextMute ? <VolumeX size={16} /> : <Volume2 size={16} />,
      duration: 2000,
    });
  };

  const handleRefresh = () => {
    window.dispatchEvent(new Event("online"));
    toast.success("Refreshing data...", { duration: 2000 });
  };

  const handleLogout = async () => {
    const userName = localStorage.getItem("userName");
    localStorage.removeItem("userName");

    if (userName) {
      await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName, status: "Offline" }),
      }).catch(() => {});
    }

    await fetch("/api/auth/logout", { method: "POST" });
    await clearSavedPages();
    window.location.href = "/";
  };

  useEffect(() => { setIsOpen(false); }, [pathname]);

  if (!shellVisible(pathname)) return null;

  const isInCashierView = pathname.startsWith("/cashier") || !isAdmin;

  const currentNavItems = isInCashierView
    ? [
        { href: "/cashier",             label: "Dashboard",   icon: LayoutDashboard },
        { href: "/cashier/new-entry",   label: "New Sale",    icon: PlusCircle },
        { href: "/cashier/board",       label: "Job Board",   icon: KanbanSquare },
        { href: "/cashier/customers",   label: "Customers",   icon: Users },
        { href: "/cashier/inventory",   label: "Stock",       icon: Package },
        { href: "/cashier/estimator",   label: "Estimator",   icon: Calculator },
        { href: "/cashier/quick-check", label: "Quick-Check", icon: Ruler },
        { href: "/cashier/records",     label: "Records",     icon: BarChart3 },
        { href: "/cashier/expenses",    label: "Expenses",    icon: Receipt },
      ]
    : [
        { href: "/bom03",           label: "Dashboard",    icon: LayoutDashboard },
        { href: "/bom03/new-entry", label: "New Sale",     icon: PlusCircle },
        { href: "/bom03/board",     label: "Job Board",    icon: KanbanSquare },
        { href: "/bom03/customers", label: "Customers",    icon: Users },
        { href: "/bom03/quick-check", label: "Quick-Check",  icon: Ruler },
        { href: "/bom03/records",   label: "Records",      icon: BarChart3 },
        { href: "/bom03/expenses",  label: "Expenses",     icon: Receipt },
        { href: "/bom03/inventory", label: "Inventory",    icon: Package },
        { href: "/bom03/approvals", label: "Approvals",    icon: ShieldCheck },
        ownerSettingsNav,
      ];

  return (
    <>
      {/* Fixed mobile header */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { md: "none" },
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
          color: "text.primary",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", minHeight: 64 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton edge="start" onClick={() => setIsOpen(true)} sx={{ color: "text.secondary" }}>
              <Menu size={24} />
            </IconButton>
            <Box component={Link} href={isInCashierView ? "/cashier" : "/bom03"} aria-label="BOMedia home" sx={headerHomeLinkStyles}>
              <Typography variant="caption" sx={{ fontWeight: 900, color: accent, textTransform: "uppercase", letterSpacing: "-0.03em", lineHeight: 1, display: "block", fontSize: "0.875rem" }}>
                BOMedia
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1, fontSize: "0.6rem" }}>
                {isAdmin ? "Admin" : "Cashier"}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Tooltip title="Refresh data">
              <IconButton onClick={handleRefresh} size="small" aria-label="Refresh data" sx={{ color: "text.secondary", "&:hover": { color: accent } }}>
                <RefreshCw size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title={hasHydrated && isMuted ? "Unmute notifications" : "Mute notifications"}>
              <IconButton
                onClick={toggleMute}
                size="small"
                aria-label={hasHydrated && isMuted ? "Unmute notifications" : "Mute notifications"}
                sx={{
                  color: hasHydrated && isMuted ? "error.main" : "text.secondary",
                  bgcolor: hasHydrated && isMuted ? "error.light" : "transparent",
                  "&:hover": { color: accent },
                }}
              >
                {hasHydrated && isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </IconButton>
            </Tooltip>
            <ActivityFeed />
            <ThemeToggle />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Spacer under fixed header */}
      <Box sx={{ display: { md: "none" }, height: 64 }} />

      {/* Mobile nav drawer */}
      <Drawer
        anchor="left"
        open={isOpen}
        onClose={() => setIsOpen(false)}
        sx={{ display: { md: "none" }, "& .MuiDrawer-paper": { width: 280 } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Box sx={{ px: 3, pt: 3, pb: 2 }}>
            <Logo />
            <Typography variant="caption" sx={{ color: whiteTint(0.5), mt: 0.5, ml: 6, display: "block" }}>
              Sales &amp; Expenses
            </Typography>
          </Box>

          <List sx={{ flex: 1, px: 1.5, overflowY: "auto" }}>
            {currentNavItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href === ownerSettingsNav.href && pathname.startsWith(`${href}/`));
              return (
                <ListItemButton
                  key={href}
                  component={Link}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  selected={active}
                  sx={{
                    borderRadius: 2.5,
                    mb: 0.5,
                    gap: 1,
                    color: active ? "primary.contrastText" : whiteTint(0.65),
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { bgcolor: "primary.dark" },
                    },
                    "&:hover": { bgcolor: whiteTint(0.05), color: "common.white" },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                    <Icon size={20} />
                  </ListItemIcon>
                  <ListItemText primary={label} sx={{ "& .MuiListItemText-primary": { fontSize: "0.9375rem", fontWeight: 500 } }} />
                </ListItemButton>
              );
            })}
          </List>

          <Box sx={{ mt: "auto", px: 2, pb: 3 }}>
            {/* Sync status */}
            <Box sx={{ p: 1.5, bgcolor: whiteTint(0.05), borderRadius: 2, border: "1px solid", borderColor: whiteTint(0.08), mb: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: whiteTint(0.4), textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "0.6rem" }}>
                  Sync Queue
                </Typography>
                {syncStatus === "syncing" ? (
                  <CircularProgress size={12} />
                ) : pendingQueue.length > 0 ? (
                  <Box component="span" sx={syncIconStyles.waiting}><CloudOff size={12} /></Box>
                ) : (
                  <Box component="span" sx={syncIconStyles.synced}><Cloud size={12} /></Box>
                )}
              </Box>
              <Typography variant="caption" sx={{ color: whiteTint(0.6) }}>
                {pendingQueue.length} items waiting for network
              </Typography>
            </Box>

            <Divider sx={{ borderColor: whiteTint(0.1), mb: 2 }} />

            {isAdmin && (
              <Button
                color="inherit"
                fullWidth
                startIcon={<ArrowLeftRight size={18} />}
                onClick={() => { router.push(isInCashierView ? "/bom03" : "/cashier"); setIsOpen(false); }}
                sx={{ justifyContent: "flex-start", color: whiteTint(0.5), "&:hover": { bgcolor: whiteTint(0.05), color: "common.white" }, mb: 1, textTransform: "none" }}
              >
                {isInCashierView ? "Switch to Admin View" : "Switch to Cashier View"}
              </Button>
            )}

            <Button
              color="inherit"
              fullWidth
              startIcon={<LogOut size={18} />}
              onClick={handleLogout}
              sx={{ justifyContent: "flex-start", color: whiteTint(0.4), "&:hover": { bgcolor: whiteTint(0.05), color: "common.white" }, textTransform: "none" }}
            >
              Log Out
            </Button>

            <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: whiteTint(0.2), mt: 2 }}>
              BOMedia Management System
            </Typography>
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
