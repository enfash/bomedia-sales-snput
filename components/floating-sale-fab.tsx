"use client";

import { Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function FloatingSaleActionButton() {
  return (
    <div className="fixed bottom-6 right-6 z-50 md:hidden">
      <Link href="/new-entry">
        <Button 
          size="icon" 
          className="h-14 w-14 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-2xl shadow-amber-500/40 border-4 border-white dark:border-zinc-900 transition-all hover:scale-110 active:scale-95"
        >
          <Plus className="w-8 h-8" />
        </Button>
      </Link>
    </div>
  );
}
