import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, PlusCircle, Receipt, BarChart3, Users, KanbanSquare,
  Ruler, Package, Calculator, ShieldCheck,
} from "lucide-react";
import { ownerSettingsNav } from "@/components/settings-navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export interface NavMenu {
  home: NavItem;
  groups: NavGroup[];
  // Pinned after the groups (owner only).
  footer: NavItem[];
  // Owner groups fold away; cashier groups are always open under a label.
  foldable: boolean;
  // Groups that are open before the person has chosen anything.
  defaultOpen: string[];
}

// One list per portal. Both the desktop sidebar and the phone menu read these, so a new page is added here once.
export const adminNavMenu: NavMenu = {
  home: { href: "/bom03", label: "Dashboard", icon: LayoutDashboard },
  groups: [
    { id: "sell", label: "Sell", items: [
      { href: "/bom03/new-entry", label: "New Sale", icon: PlusCircle },
      { href: "/bom03/board", label: "Job Board", icon: KanbanSquare },
      { href: "/bom03/customers", label: "Customers", icon: Users },
    ] },
    { id: "stock", label: "Stock", items: [
      { href: "/bom03/inventory", label: "Inventory", icon: Package },
      { href: "/bom03/quick-check", label: "Quick-Check", icon: Ruler },
    ] },
    { id: "money", label: "Money", items: [
      { href: "/bom03/records", label: "Records", icon: BarChart3 },
      { href: "/bom03/expenses", label: "Expenses", icon: Receipt },
      { href: "/bom03/approvals", label: "Approvals", icon: ShieldCheck },
    ] },
  ],
  footer: [ownerSettingsNav],
  foldable: true,
  defaultOpen: ["sell"],
};

export const cashierNavMenu: NavMenu = {
  home: { href: "/cashier", label: "Dashboard", icon: LayoutDashboard },
  groups: [
    { id: "sell", label: "Sell", items: [
      { href: "/cashier/new-entry", label: "New Sale", icon: PlusCircle },
      { href: "/cashier/board", label: "Job Board", icon: KanbanSquare },
      { href: "/cashier/customers", label: "Customers", icon: Users },
      { href: "/cashier/estimator", label: "Estimator", icon: Calculator },
    ] },
    { id: "stock", label: "Stock", items: [
      { href: "/cashier/inventory", label: "Stock", icon: Package },
      { href: "/cashier/quick-check", label: "Quick-Check", icon: Ruler },
    ] },
    { id: "money", label: "Money", items: [
      { href: "/cashier/records", label: "Records", icon: BarChart3 },
      { href: "/cashier/expenses", label: "Expenses", icon: Receipt },
    ] },
  ],
  footer: [],
  foldable: false,
  defaultOpen: ["sell", "stock", "money"],
};

// Settings has sub-pages, so it stays selected underneath /bom03/settings.
export function isNavItemActive(pathname: string, item: NavItem) {
  return pathname === item.href || (item.href === ownerSettingsNav.href && pathname.startsWith(`${item.href}/`));
}

export function activeGroupId(menu: NavMenu, pathname: string) {
  return menu.groups.find((group) => group.items.some((item) => isNavItemActive(pathname, item)))?.id ?? null;
}

// Which groups are open: the saved choice if there is one, else the defaults. The group holding the current page is always open.
export function openGroupIds(menu: NavMenu, saved: string[] | null, pathname: string) {
  if (!menu.foldable) return menu.groups.map((group) => group.id);
  const open = new Set(saved ?? menu.defaultOpen);
  const current = activeGroupId(menu, pathname);
  if (current) open.add(current);
  return [...open];
}

export function parseSavedGroups(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;
  } catch {
    return null;
  }
}
