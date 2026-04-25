"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, BarChart3, PlusCircle, KanbanSquare, Package, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export function BottomNav() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/bom03");
  const isCashier = pathname?.startsWith("/cashier") || isAdmin;

  const navItems = useMemo(() => isAdmin
    ? [
        { label: "Dash",    icon: LayoutDashboard, href: "/bom03" },
        { label: "Board",   icon: KanbanSquare,    href: "/bom03/board" },
        { label: "New",     icon: PlusCircle,      href: "/new-entry", primary: true },
        { label: "Stock",   icon: Package,         href: "/bom03/inventory" },
        { label: "Staff",   icon: Users,           href: "/bom03/staff" },
      ]
    : [
        { label: "Home",    icon: LayoutDashboard, href: "/cashier" },
        { label: "Board",   icon: KanbanSquare,    href: "/cashier/board" },
        { label: "New",     icon: PlusCircle,      href: "/new-entry", primary: true },
        { label: "Records", icon: BarChart3,       href: "/cashier/records" },
        { label: "Expense", icon: Receipt,         href: "/cashier/expenses" },
      ], [isAdmin]);

  if (!isCashier) return null;

  // Determine color scheme based on portal type
  const primaryClass = isAdmin
    ? "from-brand-700 to-brand-800"
    : "from-orange-500 to-orange-600";
  const shadowClass = isAdmin ? "shadow-brand-700/20" : "shadow-orange-500/20";
  const activeColorClass = isAdmin ? "text-brand-700" : "text-orange-500";

  return (
    <div className="md:hidden fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none">
      <nav
        className={cn(
          "max-w-md mx-auto h-18 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/40 dark:border-zinc-800/50 rounded-[2rem] shadow-[0_12px_40px_rgba(0,0,0,0.15)] flex items-center justify-around px-2 pointer-events-auto ring-1 ring-black/5 dark:ring-white/5",
          isAdmin &&
            "border-primary/20 dark:border-primary/20 shadow-primary/10",
        )}
      >
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/cashier" &&
              item.href !== "/bom03" &&
              pathname?.startsWith(item.href));
          const Icon = item.icon;

          if (item.primary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center -translate-y-6"
              >
                <div
                  className={cn(
                    "w-14 h-14 rounded-full shadow-[0_8px_20px] flex items-center justify-center border-4 border-gray-50 dark:border-zinc-950 transition-transform active:scale-95",
                    `bg-gradient-to-br ${primaryClass}`,
                    `${shadowClass}`,
                  )}
                >
                  <PlusCircle className="w-8 h-8 text-white" />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-tighter mt-1",
                    isAdmin
                      ? "text-brand-700 dark:text-brand-300"
                       : "text-orange-600 dark:text-orange-400",
                  )}
                >
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
                isActive
                  ? cn("scale-105", activeColorClass)
                  : "text-gray-500 dark:text-zinc-400",
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
              <span
                className={cn(
                  "text-[9px] font-semibold uppercase tracking-tight",
                  isActive ? "opacity-100" : "opacity-75",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
