"use client";

import { useRouter } from "next/navigation";
import { ExpenseEntry } from "@/components/expense-entry";
import { Receipt, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ExpensesPage() {
  const router = useRouter();

  return (
    <div className="p-6 md:p-8 max-w-3xl min-h-screen bg-transparent">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Button variant="ghost" size="icon" onClick={() => router.back()}
            className="md:hidden rounded-xl h-9 w-9 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 transition-[transform] duration-150 ease-out active:scale-[0.97]">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-red-500 dark:text-rose-500" />
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Expenses</h1>
          </div>
        </div>
        <p className="text-gray-500 dark:text-zinc-400 text-sm font-medium">Record business expenses directly to the Expenses sheet.</p>
      </div>
      <ExpenseEntry />
    </div>
  );
}
