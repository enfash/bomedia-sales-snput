"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, PlusCircle, Receipt, BarChart3, Cloud, CloudOff, RefreshCw, LogOut, Users, KanbanSquare, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { ActivityFeed } from "./activity-feed";


const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new-entry", label: "New Sale", icon: PlusCircle },
  { href: "/cashier/expenses", label: "Log Expense", icon: Receipt },
  { href: "/cashier/records", label: "Records", icon: BarChart3 },
];

interface SidebarProps {
  isAdmin?: boolean;
}

export function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const [userName, setUserName] = useState("");
  const { pendingQueue, syncStatus, lastSyncTime } = useSyncStore();

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "Staff");
  }, []);

  const handleLogout = async () => {
    const userName = localStorage.getItem("userName");
    localStorage.removeItem("userName");
    
    // Attempt to free the session if applicable
    if (userName) {
      await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName, status: "Offline" }),
      }).catch(() => {});
    }

    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  if (pathname === "/bom03/login" || pathname === "/") return null;

  const currentNavItems = pathname.startsWith("/cashier") || !isAdmin
    ? [
        { href: "/cashier", label: "Dashboard", icon: LayoutDashboard },
        { href: "/new-entry", label: "New Sale", icon: PlusCircle },
        { href: "/cashier/board", label: "Job Board", icon: KanbanSquare },
        { href: "/cashier/customers", label: "Customers", icon: Users },
        { href: "/quick-check", label: "Quick-Check", icon: Ruler },
        { href: "/cashier/records", label: "Records", icon: BarChart3 },
        { href: "/cashier/expenses", label: "Log Expense", icon: Receipt },
      ]
    : [
        { href: "/bom03", label: "Dashboard", icon: LayoutDashboard },
        { href: "/new-entry", label: "New Sale", icon: PlusCircle },
        { href: "/bom03/board", label: "Job Board", icon: KanbanSquare },
        { href: "/bom03/customers", label: "Customers", icon: Users },
        { href: "/quick-check", label: "Quick-Check", icon: Ruler },
        { href: "/bom03/records", label: "Records", icon: BarChart3 },
        { href: "/bom03/expenses", label: "Log Expense", icon: Receipt },
        { href: "/bom03/staff", label: "Staff Manager", icon: Users },
      ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-60 bg-gray-900 dark:bg-zinc-950 text-white flex flex-col shadow-xl transition-colors duration-500">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-6 border-b border-gray-700/60 dark:border-zinc-800/50">
        <Logo className="text-white" />
        <div className="flex items-center gap-1">
          <ActivityFeed />
          <ThemeToggle />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {currentNavItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-gray-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sync Status Section */}
      <div className="px-4 py-4 border-t border-gray-700/60 dark:border-zinc-800/50 bg-gray-800/20 dark:bg-zinc-900/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sync Status</span>
          {syncStatus === 'syncing' ? (
            <RefreshCw className="w-3 h-3 text-primary animate-spin" />
          ) : pendingQueue.length > 0 ? (
            <CloudOff className="w-3 h-3 text-amber-500 dark:text-amber-400" />
          ) : (
            <Cloud className="w-3 h-3 text-green-400" />
          )}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-300">{pendingQueue.length} pending items</p>
            {pendingQueue.length > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </div>
          {lastSyncTime && (
            <p className="text-[10px] text-gray-500">Last sync: {new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </div>
      </div>

      {/* User badge */}
      {userName && (
        <div className="px-4 py-4 border-t border-gray-700/60 dark:border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold shrink-0">
                {userName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName}</p>
                <p className="text-[10px] text-gray-400 font-medium">{isAdmin ? "Admin" : "Cashier"}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 dark:hover:bg-zinc-900 transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
