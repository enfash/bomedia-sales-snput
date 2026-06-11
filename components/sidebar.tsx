"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, PlusCircle, Receipt, BarChart3,
  Cloud, CloudOff, LogOut, Users, KanbanSquare,
  Ruler, Package, Calculator, ArrowLeftRight, Menu, ChevronLeft
} from "lucide-react";
import Tooltip from "@mui/material/Tooltip";
import { useSyncStore } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { ActivityFeed } from "./activity-feed";

import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";

interface SidebarProps {
  isAdmin?: boolean;
}

export function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const { pendingQueue, syncStatus, lastSyncTime } = useSyncStore();
  
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved === "true") setIsCollapsed(true);
    setUserName(localStorage.getItem("userName") || "Staff");
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    const userName = localStorage.getItem("userName");
    localStorage.removeItem("userName");

    if (userName) {
      fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName, status: "Offline" }),
      }).catch(() => {});
    }

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // cookie cleared server-side; redirect anyway
    }

    window.location.href = "/";
  };

  if (pathname === "/bom03/login" || pathname === "/cashier/login" || pathname === "/") return null;

  const isInCashierView = pathname.startsWith("/cashier") || !isAdmin;

  const currentNavItems = isInCashierView
    ? [
        { href: "/cashier",           label: "Dashboard",   icon: LayoutDashboard },
        { href: "/cashier/new-entry", label: "New Sale",    icon: PlusCircle },
        { href: "/cashier/board",     label: "Job Board",   icon: KanbanSquare },
        { href: "/cashier/customers", label: "Customers",   icon: Users },
        { href: "/cashier/inventory", label: "Stock",       icon: Package },
        { href: "/cashier/estimator", label: "Estimator",   icon: Calculator },
        { href: "/quick-check",       label: "Quick-Check", icon: Ruler },
        { href: "/cashier/records",   label: "Records",     icon: BarChart3 },
        { href: "/cashier/expenses",  label: "Expenses",    icon: Receipt },
      ]
    : [
        { href: "/bom03",           label: "Dashboard",    icon: LayoutDashboard },
        { href: "/bom03/new-entry", label: "New Sale",     icon: PlusCircle },
        { href: "/bom03/board",     label: "Job Board",    icon: KanbanSquare },
        { href: "/bom03/customers", label: "Customers",    icon: Users },
        { href: "/quick-check",     label: "Quick-Check",  icon: Ruler },
        { href: "/bom03/records",   label: "Records",      icon: BarChart3 },
        { href: "/bom03/expenses",  label: "Expenses",     icon: Receipt },
        { href: "/bom03/staff",     label: "Staff Manager",icon: Users },
      ];

  const DRAWER_WIDTH = isCollapsed ? 80 : 240;

  return (
    <Drawer
      variant="permanent"
      anchor="left"
      sx={{
        display: { xs: "none", md: "flex" },
        width: DRAWER_WIDTH,
        flexShrink: 0,
        transition: "width 0.2s",
        "& .MuiDrawer-paper": { 
          width: DRAWER_WIDTH, 
          boxSizing: "border-box", 
          transition: "width 0.2s",
          overflowX: "hidden" 
        },
      }}
    >
      {/* Logo row */}
      <Box sx={{ 
        display: "flex", 
        flexDirection: isCollapsed ? "column" : "row",
        alignItems: "center", 
        justifyContent: "space-between", 
        px: isCollapsed ? 1 : 2.5, 
        py: isCollapsed ? 2 : 3, 
        gap: isCollapsed ? 2 : 0,
        borderBottom: "1px solid rgba(255,255,255,0.08)" 
      }}>
        {isCollapsed ? (
          <>
            <Tooltip title="Expand sidebar" placement="right" arrow>
              <IconButton onClick={toggleSidebar} sx={{ color: "rgba(255,255,255,0.7)" }}>
                <Menu size={20} />
              </IconButton>
            </Tooltip>
            <Logo showText={false} />
          </>
        ) : (
          <>
            <Logo />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ActivityFeed />
              <Tooltip title="Collapse sidebar" placement="right" arrow>
                <IconButton onClick={toggleSidebar} sx={{ color: "rgba(255,255,255,0.7)", mr: -1 }}>
                  <ChevronLeft size={20} />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}
      </Box>

      {/* Nav links */}
      <List sx={{ flex: 1, px: 1, py: 1.5, overflowY: "auto" }}>
        {currentNavItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Tooltip key={href} title={isCollapsed ? label : ""} placement="right" arrow disableHoverListener={!isCollapsed}>
              <ListItemButton
                component={Link}
                href={href}
                selected={active}
                sx={{
                  mb: 0.5,
                  gap: 1,
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  px: isCollapsed ? 1 : 2,
                  color: active ? "primary.contrastText" : "rgba(255,255,255,0.65)",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                  "&:hover": { bgcolor: "rgba(255,255,255,0.05)", color: "#fff" },
                }}
              >
                <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 32, mr: isCollapsed ? 0 : 1, justifyContent: "center", color: "inherit" }}>
                  <Icon size={isCollapsed ? 22 : 16} />
                </ListItemIcon>
                {!isCollapsed && <ListItemText primary={label} sx={{ "& .MuiListItemText-primary": { fontSize: "0.875rem", fontWeight: 500 } }} />}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>

      {/* Sync status */}
      <Box sx={{ px: isCollapsed ? 1 : 2, py: 2, borderTop: "1px solid rgba(255,255,255,0.08)", bgcolor: "rgba(255,255,255,0.03)" }}>
        {isCollapsed ? (
          <Tooltip title={`${pendingQueue.length} pending items. Status: ${syncStatus}`} placement="right" arrow>
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              {syncStatus === "syncing" ? <CircularProgress size={16} /> : pendingQueue.length > 0 ? <CloudOff size={16} style={{ color: "#f59e0b" }} /> : <Cloud size={16} style={{ color: "#4ade80" }} />}
            </Box>
          </Tooltip>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontSize: "0.6rem" }}>
                Sync Status
              </Typography>
              {syncStatus === "syncing" ? (
                <CircularProgress size={12} />
              ) : pendingQueue.length > 0 ? (
                <CloudOff size={12} style={{ color: "#f59e0b" }} />
              ) : (
                <Cloud size={12} style={{ color: "#4ade80" }} />
              )}
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.75rem" }}>
                {pendingQueue.length} pending items
              </Typography>
              {pendingQueue.length > 0 && (
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#f59e0b" }} />
              )}
            </Box>
            {lastSyncTime && (
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)", fontSize: "0.625rem", display: "block", mt: 0.5 }}>
                Last sync: {new Date(lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Typography>
            )}
          </>
        )}
      </Box>

      {/* Portal switcher — admin only */}
      {isAdmin && (
        <Box sx={{ px: 1, pb: 1 }}>
          <Tooltip title={isInCashierView ? "Switch to Admin View" : "Switch to Cashier View"} placement="right" arrow disableHoverListener={!isCollapsed}>
            <ListItemButton
              onClick={() => router.push(isInCashierView ? "/bom03" : "/cashier")}
              sx={{ color: "rgba(255,255,255,0.5)", "&:hover": { bgcolor: "rgba(255,255,255,0.05)", color: "#fff" }, justifyContent: isCollapsed ? "center" : "flex-start" }}
            >
              <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 28, justifyContent: "center", color: "inherit" }}>
                <ArrowLeftRight size={isCollapsed ? 18 : 14} />
              </ListItemIcon>
              {!isCollapsed && <ListItemText primary={isInCashierView ? "Switch to Admin View" : "Switch to Cashier View"} sx={{ "& .MuiListItemText-primary": { fontSize: "0.75rem", fontWeight: 600 } }} />}
            </ListItemButton>
          </Tooltip>
        </Box>
      )}

      {/* User badge */}
      {userName && (
        <>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
          <Box sx={{ px: isCollapsed ? 1 : 2, py: 2, display: "flex", flexDirection: isCollapsed ? "column" : "row", alignItems: "center", justifyContent: isCollapsed ? "center" : "space-between", gap: isCollapsed ? 2 : 0 }}>
            {isCollapsed ? (
              <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: "0.875rem", fontWeight: 700 }}>
                {userName[0]?.toUpperCase()}
              </Avatar>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: "0.875rem", fontWeight: 700 }}>
                  {userName[0]?.toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ color: "#fff", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {userName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.625rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {isAdmin ? "Admin" : "Cashier"}
                  </Typography>
                </Box>
              </Box>
            )}
            <Box sx={{ display: "flex", flexDirection: isCollapsed ? "column" : "row", gap: 0.5, alignItems: "center" }}>
              <ThemeToggle />
              <Tooltip title="Log out" placement={isCollapsed ? "right" : "top"}>
                <IconButton onClick={handleLogout} size="small" aria-label="Log out" sx={{ color: "rgba(255,255,255,0.4)", "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.08)" } }}>
                  <LogOut size={isCollapsed ? 20 : 16} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </>
      )}
    </Drawer>
  );
}
