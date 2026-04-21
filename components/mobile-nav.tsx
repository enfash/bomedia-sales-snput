"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, PlusCircle, Receipt, BarChart3, Cloud, CloudOff, RefreshCw, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";


const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new-entry", label: "New Sale", icon: PlusCircle },
  { href: "/cashier/expenses", label: "Log Expense", icon: Receipt },
  { href: "/cashier/records", label: "Records", icon: BarChart3 },
];

interface MobileNavProps {
  isAdmin?: boolean;
}

export function MobileNav({ isAdmin = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { pendingQueue, syncStatus } = useSyncStore();

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

  // Close nav when path changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Prevent scrolling when nav is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [isOpen]);

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
    <>
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-gray-900 dark:bg-zinc-950 text-white flex items-center justify-between px-4 z-50 border-b border-gray-800 dark:border-zinc-800 transition-colors duration-500">
        <div className="flex items-center gap-2">
          <Logo showText={true} className="text-white" />
          {pendingQueue.length > 0 && (
            <span className="ml-1 flex items-center gap-1 text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">
              <RefreshCw className={cn("w-2 h-2", syncStatus === 'syncing' && "animate-spin")} />
              {pendingQueue.length}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsOpen(!isOpen)}
            className="text-white hover:bg-gray-800 dark:hover:bg-zinc-900 h-10 w-10 shrink-0"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </header>

      {/* Spacer to prevent content from hiding behind fixed header */}
      <div className="md:hidden h-16 w-full" />

      {/* Mobile Nav Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden animation-in fade-in transition-all duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="absolute left-0 top-0 bottom-0 w-[280px] bg-gray-900 dark:bg-zinc-950 p-6 shadow-2xl flex flex-col animation-in slide-in-from-left duration-300 transition-colors duration-500"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-8">
              <Logo className="text-white" />
              <p className="text-xs text-gray-400 mt-1 ml-12">Sales & Expenses</p>
            </div>

            <nav className="flex-1 space-y-2">
              {currentNavItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium transition-all transition-all duration-200",
                      active
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
                        : "text-gray-300 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto space-y-4">
              {/* Sync Status for Mobile */}
              <div className="p-4 bg-gray-800/40 dark:bg-zinc-900/40 rounded-xl border border-gray-700/50 dark:border-zinc-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Sync Queue</span>
                  {syncStatus === 'syncing' ? (
                    <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin" />
                  ) : pendingQueue.length > 0 ? (
                    <CloudOff className="w-3 h-3 text-orange-400" />
                  ) : (
                    <Cloud className="w-3 h-3 text-green-400" />
                  )}
                </div>
                <p className="text-xs text-gray-300">{pendingQueue.length} items waiting for network</p>
              </div>

              <div className="pt-6 border-t border-gray-800 text-center space-y-4">
                <Button 
                  variant="ghost" 
                  className="w-full text-gray-400 hover:text-white hover:bg-gray-800 dark:hover:bg-zinc-900 justify-start" 
                  onClick={handleLogout}
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  Log Out
                </Button>
                <p className="text-xs text-gray-600 font-medium">BOMedia Management System</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
