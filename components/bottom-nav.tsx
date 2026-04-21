"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, BarChart3, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/bom03");
  const isCashier = pathname?.startsWith("/cashier") || isAdmin;

  if (!isCashier) return null;

  const navItems = isAdmin
    ? [
        { label: "Dash", icon: LayoutDashboard, href: "/bom03" },
        { label: "Records", icon: BarChart3, href: "/bom03/records" },
        { label: "New", icon: PlusCircle, href: "/new-entry", primary: true },
        { label: "Expense", icon: Receipt, href: "/bom03/expenses" },
      ]
    : [
        { label: "Home", icon: LayoutDashboard, href: "/cashier" },
        { label: "Records", icon: BarChart3, href: "/bom03/records" },
        { label: "New", icon: PlusCircle, href: "/cashier/sales", primary: true },
        { label: "Expense", icon: Receipt, href: "/cashier/expenses" },
      ];

  return (
    <div className="md:hidden fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none">
      <nav className="max-w-md mx-auto h-18 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/40 dark:border-zinc-800/50 rounded-[2rem] shadow-[0_12px_40px_rgba(0,0,0,0.15)] flex items-center justify-around px-2 pointer-events-auto ring-1 ring-black/5 dark:ring-white/5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/cashier" && pathname?.startsWith(item.href));
          const Icon = item.icon;

          if (item.primary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center -translate-y-6"
              >
                <div className="w-14 h-14 bg-primary rounded-full shadow-[0_8px_20px_rgba(79,70,229,0.35)] flex items-center justify-center border-4 border-gray-50 dark:border-zinc-950 transition-transform active:scale-95">
                  <PlusCircle className="w-8 h-8 text-white" />
                </div>
                <span className="text-[10px] font-bold text-primary mt-1 uppercase tracking-tighter">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2 transition-all active:scale-95",
                isActive ? "text-primary scale-105" : "text-gray-500 dark:text-zinc-400"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
              <span className={cn(
                "text-[9px] font-semibold uppercase tracking-tight",
                isActive ? "opacity-100" : "opacity-75"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
