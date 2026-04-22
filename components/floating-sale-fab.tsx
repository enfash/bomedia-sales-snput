"use client";

import { Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function FloatingSaleActionButton() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/bom03");

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
