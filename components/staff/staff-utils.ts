// Pure helpers and types for the Staff Manager. No styling and no data access here.
import { avatarTone } from "@/lib/avatar-tone";

export interface StaffStats {
  name: string;
  totalJobs: number;
  totalRevenue: number;
  totalCollected: number;
  totalDebt: number;
  collectionRate: number;
  jobsToday: number;
  revenueToday: number;
  topMaterial: string;
  recentJobs: any[];
  isOnline: boolean;
  lastLogin: string;
}

export interface Cashier {
  Name: string;
  Status: string;
  "Last Login": string;
  "Last Active": string;
  Passcode?: string;
  HasPasscode?: boolean;
  _rowIndex?: number;
}

const ONLINE_THRESHOLD_MS = 7 * 60 * 1000; // 7 min = 2 missed heartbeats + buffer

export function isReallyOnline(cashier: Cashier): boolean {
  const lastActive = cashier["Last Active"];
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < ONLINE_THRESHOLD_MS;
}

/** Which staff the Staff Manager lists: everyone not removed or hidden, only those signed in now, only hidden staff, only removed staff, or all of them. */
export type StaffView = "active" | "online" | "hidden" | "removed" | "all";
export const STAFF_VIEWS: { value: StaffView; label: string }[] = [
  { value: "active", label: "Active staff" },
  { value: "online", label: "Signed in now" },
  { value: "hidden", label: "Hidden staff" },
  { value: "removed", label: "Removed staff" },
  { value: "all", label: "All staff" },
];
export function staffInView(view: StaffView, person: { removed: boolean; online: boolean; hidden?: boolean }): boolean {
  const hidden = Boolean(person.hidden);
  if (view === "all") return true;
  if (view === "removed") return person.removed;
  if (view === "hidden") return !person.removed && hidden;
  if (view === "online") return !person.removed && !hidden && person.online;
  return !person.removed && !hidden;
}
export const isStaffView = (value: unknown): value is StaffView => STAFF_VIEWS.some((v) => v.value === value);

/** ISO timestamps from the database become Lagos time ("11 Oct, 4:06 am"); older free-text values are kept as they are. */
export function readableLogin(value: string | null | undefined): string {
  if (!value) return "Never";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });
}

export function lastSeenLabel(cashier: Cashier): string {
  const lastActive = cashier["Last Active"];
  if (!lastActive) return readableLogin(cashier["Last Login"]);
  const diffMs = Date.now() - new Date(lastActive).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return readableLogin(cashier["Last Login"]);
}

export const parseAmt = (v: any) =>
  parseFloat(String(v ?? "0").replace(/[₦,\s]/g, "")) || 0;

export const fmtMoney = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

export const compactMoney = (n: number) =>
  n >= 1000 ? `₦${(n / 1000).toFixed(0)}k` : fmtMoney(n);

export const avatarBg = avatarTone;

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}
