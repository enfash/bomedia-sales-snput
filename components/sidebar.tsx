"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, PlusCircle, Receipt, BarChart3, Cloud, CloudOff, RefreshCw, LogOut, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";

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
        { href: "/cashier/expenses", label: "Log Expense", icon: Receipt },
        { href: "/cashier/records", label: "Records", icon: BarChart3 },
      ]
    : [
        { href: "/bom03", label: "Dashboard", icon: LayoutDashboard },
        { href: "/new-entry", label: "New Sale", icon: PlusCircle },
        { href: "/bom03/expenses", label: "Log Expense", icon: Receipt },
        { href: "/bom03/records", label: "Records", icon: BarChart3 },
        { href: "/bom03/staff", label: "Staff Manager", icon: Users },
      ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-60 bg-gray-900 text-white flex flex-col shadow-xl">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-gray-700/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center font-bold text-lg shrink-0">
            B
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">BOMedia</p>
            <p className="text-xs text-gray-400 leading-tight">Sales & Expenses</p>
          </div>
        </div>
        <ThemeToggle />
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
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sync Status Section */}
      <div className="px-4 py-4 border-t border-gray-700/60 bg-gray-800/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sync Status</span>
          {syncStatus === 'syncing' ? (
            <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin" />
          ) : pendingQueue.length > 0 ? (
            <CloudOff className="w-3 h-3 text-orange-400" />
          ) : (
            <Cloud className="w-3 h-3 text-green-400" />
          )}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-300">{pendingQueue.length} pending items</p>
            {pendingQueue.length > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            )}
          </div>
          {lastSyncTime && (
            <p className="text-[10px] text-gray-500">Last sync: {new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </div>
      </div>

      {/* User badge */}
      {userName && (
        <div className="px-4 py-4 border-t border-gray-700/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-sm font-bold shrink-0">
                {userName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName}</p>
                <p className="text-[10px] text-gray-400 font-medium">{isAdmin ? "Admin" : "Cashier"}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
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
