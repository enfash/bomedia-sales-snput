"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCashier = pathname?.startsWith("/cashier");

  return (
    <div className={cn(
      "flex min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors duration-500",
      isCashier && "theme-amber"
    )}>
      {children}
    </div>
  );
}
