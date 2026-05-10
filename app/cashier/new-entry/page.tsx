"use client";

import { SalesEntry } from "@/components/sales-entry";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CashierNewEntryPage() {
  const router = useRouter();

  return (
    <div className="p-6 md:p-8 min-h-screen">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="md:hidden rounded-xl h-9 w-9 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 transition-[transform] duration-150 ease-out active:scale-[0.97]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-orange-600 dark:text-orange-400 tracking-tight">
              Log New Sale
            </h1>
            <p className="text-gray-500 dark:text-zinc-400 mt-1">
              Log a new print job for a customer.
            </p>
          </div>
        </div>
      </div>
      <SalesEntry />
    </div>
  );
}
