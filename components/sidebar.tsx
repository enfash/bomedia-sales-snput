"use client";

import { shellVisible } from "@/lib/session-view";
import { clearSavedPages } from "@/components/session-guard";
import { NavGroups } from "@/components/nav-groups";
import { adminNavMenu, cashierNavMenu } from "@/lib/nav-groups";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cloud, CloudOff, LogOut, ArrowLeftRight, Menu, ChevronLeft } from "lucide-react";
import Tooltip from "@mui/material/Tooltip";
import { useSyncStore } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { ActivityFeed } from "./activity-feed";

import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import { sidebarStyles as styles, syncIconStyles } from "@/app/theme";
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

    await clearSavedPages();
    window.location.href = "/";
  };

  if (!shellVisible(pathname)) return null;

  const isInCashierView = pathname.startsWith("/cashier") || !isAdmin;

  const menu = isInCashierView ? cashierNavMenu : adminNavMenu;

  const DRAWER_WIDTH = isCollapsed ? 80 : 240;
  const collapsed = isCollapsed;

  return (
    <Drawer variant="permanent" anchor="left" sx={styles.drawer(DRAWER_WIDTH)}>
      {/* Logo row */}
      <Box sx={[styles.logoRow, collapsed && styles.logoRowCollapsed]}>
        {isCollapsed ? (
          <>
            <Tooltip title="Expand sidebar" placement="right" arrow>
              <IconButton onClick={toggleSidebar} sx={styles.toggle}>
                <Menu size={20} />
              </IconButton>
            </Tooltip>
            <Logo showText={false} />
          </>
        ) : (
          <>
            <Logo />
            <Box sx={styles.logoActions}>
              <ActivityFeed />
              <Tooltip title="Collapse sidebar" placement="right" arrow>
                <IconButton onClick={toggleSidebar} sx={[styles.toggle, styles.toggleOpen]}>
                  <ChevronLeft size={20} />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}
      </Box>

      {/* Nav links */}
      <List sx={styles.navList}>
        <NavGroups menu={menu} pathname={pathname} variant="desktop" collapsed={isCollapsed} />
      </List>

      {/* Sync status */}
      <Box sx={[styles.sync, collapsed && styles.syncCollapsed]}>
        {isCollapsed ? (
          <Tooltip title={`${pendingQueue.length} pending items. Status: ${syncStatus}`} placement="right" arrow>
            <Box sx={styles.syncCentered}>
              {syncStatus === "syncing" ? <CircularProgress size={16} /> : pendingQueue.length > 0 ? <Box component="span" sx={syncIconStyles.waiting}><CloudOff size={16} /></Box> : <Box component="span" sx={syncIconStyles.synced}><Cloud size={16} /></Box>}
            </Box>
          </Tooltip>
        ) : (
          <>
            <Box sx={styles.syncHead}>
              <Typography variant="caption" sx={styles.syncLabel}>
                Sync Status
              </Typography>
              {syncStatus === "syncing" ? (
                <CircularProgress size={12} />
              ) : pendingQueue.length > 0 ? (
                <Box component="span" sx={syncIconStyles.waiting}><CloudOff size={12} /></Box>
              ) : (
                <Box component="span" sx={syncIconStyles.synced}><Cloud size={12} /></Box>
              )}
            </Box>
            <Box sx={styles.syncRow}>
              <Typography variant="caption" sx={styles.syncText}>
                {pendingQueue.length} pending items
              </Typography>
              {pendingQueue.length > 0 && (
                <Box sx={syncIconStyles.dot} />
              )}
            </Box>
            {lastSyncTime && (
              <Typography variant="caption" sx={styles.syncTime}>
                Last sync: {new Date(lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Typography>
            )}
          </>
        )}
      </Box>

      {/* Portal switcher — admin only */}
      {isAdmin && (
        <Box sx={styles.switcherWrap}>
          <Tooltip title={isInCashierView ? "Switch to Admin View" : "Switch to Cashier View"} placement="right" arrow disableHoverListener={!isCollapsed}>
            <ListItemButton
              onClick={() => router.push(isInCashierView ? "/bom03" : "/cashier")}
              sx={[styles.switcher, collapsed && styles.switcherCollapsed]}
            >
              <ListItemIcon sx={[styles.switcherIcon, collapsed && styles.switcherIconCollapsed]}>
                <ArrowLeftRight size={isCollapsed ? 18 : 14} />
              </ListItemIcon>
              {!isCollapsed && <ListItemText primary={isInCashierView ? "Switch to Admin View" : "Switch to Cashier View"} sx={styles.switcherText} />}
            </ListItemButton>
          </Tooltip>
        </Box>
      )}

      {/* User badge */}
      {userName && (
        <>
          <Divider sx={styles.divider} />
          <Box sx={[styles.user, collapsed && styles.userCollapsed]}>
            {isCollapsed ? (
              <Avatar sx={styles.avatar}>
                {userName[0]?.toUpperCase()}
              </Avatar>
            ) : (
              <Box sx={styles.userInfo}>
                <Avatar sx={styles.avatar}>
                  {userName[0]?.toUpperCase()}
                </Avatar>
                <Box sx={styles.userText}>
                  <Typography variant="body2" sx={styles.userName}>
                    {userName}
                  </Typography>
                  <Typography variant="caption" sx={styles.userRole}>
                    {isAdmin ? "Admin" : "Cashier"}
                  </Typography>
                </Box>
              </Box>
            )}
            <Box sx={[styles.userActions, collapsed && styles.userActionsCollapsed]}>
              <ThemeToggle />
              <Tooltip title="Log out" placement={isCollapsed ? "right" : "top"}>
                <IconButton onClick={handleLogout} size="small" aria-label="Log out" sx={styles.logout}>
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
