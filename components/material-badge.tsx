"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MaterialBadgeProps {
  material: string;
  className?: string;
}

export function MaterialBadge({ material, className }: MaterialBadgeProps) {
  const normalized = material.toLowerCase().trim();
  
  const getColors = () => {
    if (normalized.includes("flex")) {
      // Flex = blue
      return "bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/30";
    }
    if (normalized.includes("sav")) {
      // SAV = purple
      return "bg-brand-100/80 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border-brand-200 dark:border-brand-800/30";
    }
    if (normalized.includes("blockout")) {
      // Blockout = gray
      return "bg-gray-100/80 text-gray-600 dark:bg-zinc-800/80 dark:text-zinc-400 border-gray-200 dark:border-zinc-700";
    }
    if (normalized.includes("vinyl")) {
      return "bg-rose-100/80 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800/30";
    }
    if (normalized.includes("mesh")) {
      return "bg-brand-100/80 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border-brand-200 dark:border-brand-800/30";
    }
    if (normalized.includes("window") || normalized.includes("owv")) {
      return "bg-cyan-100/80 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/30";
    }
    if (normalized.includes("sticker") || normalized.includes("label") || normalized.includes("clear")) {
      return "bg-violet-100/80 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800/30";
    }
    if (normalized.includes("reflective")) {
      return "bg-yellow-100/80 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/30";
    }
    return "bg-gray-100/80 text-gray-600 dark:bg-zinc-800/80 dark:text-zinc-400 border-gray-200 dark:border-zinc-700";
  };

  return (
    <Badge 
      variant="outline"
      className={cn(
        "text-[9px] font-semibold uppercase tracking-wider rounded-md px-1.5 py-0 min-w-[32px] justify-center transition-all",
        getColors(),
        className
      )}
    >
      {material}
    </Badge>
  );
}
