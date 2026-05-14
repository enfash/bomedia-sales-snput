"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LayoutDashboard, PlusCircle, Receipt, BarChart3, Cloud, CloudOff, RefreshCw, LogOut, Users, KanbanSquare, Package, Volume2, VolumeX, Ruler, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { toast } from "sonner";
import { ActivityFeed } from "./activity-feed";

interface MobileNavProps {
  isAdmin?: boolean;
}

export function MobileNav({ isAdmin = false }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // Initial false matches server
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
      icon: nextMute ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />,
      duration: 2000
    });
  };

  const handleRefresh = () => {
    window.dispatchEvent(new Event("online"));
    toast.success("Refreshing data...", { duration: 2000 });
  };

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

  const isInCashierView = pathname.startsWith("/cashier") || !isAdmin;

  const currentNavItems = isInCashierView
    ? [
        { href: "/cashier",           label: "Dashboard",   icon: LayoutDashboard },
        { href: "/cashier/new-entry", label: "New Sale",    icon: PlusCircle },
        { href: "/cashier/board",     label: "Job Board",   icon: KanbanSquare },
        { href: "/cashier/customers", label: "Customers",   icon: Users },
        { href: "/quick-check",       label: "Quick-Check", icon: Ruler },
        { href: "/cashier/records",   label: "Records",     icon: BarChart3 },
        { href: "/cashier/expenses",  label: "Expenses", icon: Receipt },
      ]
    : [
        { href: "/bom03",              label: "Dashboard",    icon: LayoutDashboard },
        { href: "/bom03/new-entry",    label: "New Sale",     icon: PlusCircle },
        { href: "/bom03/board",        label: "Job Board",    icon: KanbanSquare },
        { href: "/bom03/customers",    label: "Customers",    icon: Users },
        { href: "/quick-check",        label: "Quick-Check",  icon: Ruler },
        { href: "/bom03/records",      label: "Records",      icon: BarChart3 },
        { href: "/bom03/expenses",     label: "Expenses",  icon: Receipt },
        { href: "/bom03/inventory",    label: "Inventory",    icon: Package },
        { href: "/bom03/staff",        label: "Staff Manager", icon: Users },
      ];

  return (
    <>
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800 z-50 flex items-center justify-between px-4 transition-colors duration-500">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(true)}
              className="md:hidden text-gray-600 dark:text-zinc-400"
            >
              <Menu className="w-6 h-6" />
            </Button>
            <div className="flex flex-col">
              <span className="text-sm font-black text-primary uppercase tracking-tighter leading-none">BOMedia</span>
              <span className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest leading-none mt-1">{isAdmin ? "Admin" : "Cashier"}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-9 w-9 rounded-xl text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-zinc-900"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className={cn(
              "h-9 w-9 rounded-xl transition-[background-color,color]",
              hasHydrated && isMuted 
                ? "text-rose-500 bg-rose-50 dark:bg-rose-900/10" 
                : "text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-zinc-900"
            )}
          >
            {hasHydrated && isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <ActivityFeed />
          <ThemeToggle />
        </div>
      </header>

      {/* Spacer to prevent content from hiding behind fixed header */}
      <div className="md:hidden h-16 w-full" />

      {/* Mobile Nav Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden animation-in fade-in transition-[opacity] duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="absolute left-0 top-0 bottom-0 w-[280px] bg-gray-900 dark:bg-zinc-950 p-6 shadow-2xl flex flex-col animation-in slide-in-from-left transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-8">
              <Logo className="text-white" />
              <p className="text-xs text-gray-300 mt-1 ml-12">Sales & Expenses</p>
            </div>

            <nav className="flex-1 space-y-2">
              {currentNavItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
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
                  <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-400 uppercase tracking-widest">Sync Queue</span>
                  {syncStatus === 'syncing' ? (
                    <RefreshCw className="w-3 h-3 text-primary animate-spin" />
                  ) : pendingQueue.length > 0 ? (
                    <CloudOff className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                  ) : (
                    <Cloud className="w-3 h-3 text-green-400" />
                  )}
                </div>
                <p className="text-xs text-gray-300">{pendingQueue.length} items waiting for network</p>
              </div>

              <div className="pt-6 border-t border-gray-800 space-y-2">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    className="w-full text-brand-300 hover:text-white hover:bg-brand-700/30 justify-start transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
                    onClick={() => router.push(isInCashierView ? "/bom03" : "/cashier")}
                  >
                    <ArrowLeftRight className="w-5 h-5 mr-3" />
                    {isInCashierView ? "Switch to Admin View" : "Switch to Cashier View"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full text-gray-400 hover:text-white hover:bg-gray-800 dark:hover:bg-zinc-900 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] justify-start"
                  onClick={handleLogout}
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  Log Out
                </Button>
                <p className="text-xs text-gray-600 font-medium text-center">BOMedia Management System</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
