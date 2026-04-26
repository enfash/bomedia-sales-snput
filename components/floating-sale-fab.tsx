"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Pages where the mobile BottomNav already renders a prominent "New Sale" /
 * "New Entry" centre button. The FAB must be hidden on these routes to prevent
 * a double-button overlap on mobile.
 */
const BOTTOM_NAV_HANDLES_NEW_ENTRY = [
  "/cashier",
  "/cashier/records",
  "/cashier/expenses",
  "/cashier/board",
  "/new-entry",
];

export function FloatingSaleActionButton() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/bom03");

  // Hide on any cashier page where the BottomNav already provides a New Sale button
  const isHandledByBottomNav = BOTTOM_NAV_HANDLES_NEW_ENTRY.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  );

  if (isHandledByBottomNav && !isAdmin) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 md:hidden">
      <Link href="/new-entry">
        <Button
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full text-white shadow-2xl border-4 border-white dark:border-zinc-900 transition-all hover:scale-110 active:scale-95",
            isAdmin
              ? "bg-brand-700 hover:bg-brand-800 shadow-brand-700/40"
              : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/40",
          )}
        >
          <Plus className="w-8 h-8" />
        </Button>
      </Link>
    </div>
  );
}

