"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { mobileNavStyles, navGroupStyles as styles, sidebarStyles } from "@/app/theme";
import { activeGroupId, isNavItemActive, openGroupIds, parseSavedGroups, type NavItem, type NavMenu } from "@/lib/nav-groups";

const STORAGE_KEY = "navGroupsOpen";
const CHOICE_EVENT = "nav-groups-choice";

function subscribeToChoice(onChange: () => void) {
  window.addEventListener(CHOICE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHOICE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readChoice() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

interface NavGroupsProps {
  menu: NavMenu;
  pathname: string;
  variant: "desktop" | "mobile";
  // Icon-only sidebar.
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function NavGroups({ menu, pathname, variant, collapsed = false, onNavigate }: NavGroupsProps) {
  const item = variant === "desktop" ? sidebarStyles : mobileNavStyles;
  const iconSize = collapsed ? 22 : variant === "desktop" ? 16 : 20;
  const saved = parseSavedGroups(useSyncExternalStore(subscribeToChoice, readChoice, () => null));
  // The group holding the current page stays open; the rest follow the saved choice, else the defaults.
  const open = openGroupIds(menu, saved, pathname);
  const current = activeGroupId(menu, pathname);

  const toggle = (id: string) => {
    const next = open.includes(id) ? open.filter((entry) => entry !== id) : [...open, id];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHOICE_EVENT));
    } catch { /* the choice just is not remembered */ }
  };

  const renderItem = ({ href, label, icon: Icon }: NavItem) => {
    const active = isNavItemActive(pathname, { href, label, icon: Icon });
    return (
      <Tooltip key={href} title={collapsed ? label : ""} placement="right" arrow disableHoverListener={!collapsed}>
        <ListItemButton
          component={Link}
          href={href}
          onClick={onNavigate}
          selected={active}
          sx={[item.navItem, active && item.navItemActive, collapsed && variant === "desktop" && sidebarStyles.navItemCollapsed]}
        >
          <ListItemIcon sx={[item.navIcon, collapsed && variant === "desktop" && sidebarStyles.navIconCollapsed]}>
            <Icon size={iconSize} />
          </ListItemIcon>
          {!collapsed && <ListItemText primary={label} sx={item.navText} />}
        </ListItemButton>
      </Tooltip>
    );
  };

  return (
    <>
      <Box sx={styles.home}>{renderItem(menu.home)}</Box>

      {menu.groups.map((group) => {
        if (collapsed) {
          return <Box key={group.id} sx={styles.collapsedGroup}>{group.items.map(renderItem)}</Box>;
        }
        if (!menu.foldable) {
          return (
            <Box key={group.id} sx={styles.groupPlain}>
              <Box sx={styles.headerStatic}>
                <Typography component="h2" sx={styles.headerLabel}>{group.label}</Typography>
              </Box>
              {group.items.map(renderItem)}
            </Box>
          );
        }
        const isOpen = open.includes(group.id);
        return (
          <Box key={group.id} sx={styles.group}>
            <ButtonBase
              onClick={() => toggle(group.id)}
              aria-expanded={isOpen}
              aria-controls={`nav-group-${group.id}`}
              disabled={group.id === current}
              sx={styles.header}
            >
              <Typography component="span" sx={styles.headerLabel}>{group.label}</Typography>
              <Box component="span" sx={styles.headerMeta}>
                <Typography component="span" sx={styles.headerCount}>{group.items.length}</Typography>
                {isOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
              </Box>
            </ButtonBase>
            <Collapse in={isOpen} id={`nav-group-${group.id}`} unmountOnExit>
              {group.items.map(renderItem)}
            </Collapse>
          </Box>
        );
      })}

      {menu.footer.length > 0 && <Box sx={collapsed ? styles.collapsedGroup : styles.footer}>{menu.footer.map(renderItem)}</Box>}
    </>
  );
}
