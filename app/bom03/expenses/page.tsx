import { ExpenseEntry } from "@/components/expense-entry";
import { Receipt } from "lucide-react";

export default function ExpensesPage() {
  return (
    <div className="p-6 md:p-8 max-w-3xl min-h-screen bg-transparent">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Receipt className="w-5 h-5 text-red-500 dark:text-rose-500" />
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Log Expense</h1>
        </div>
        <p className="text-gray-500 dark:text-zinc-400 text-sm font-medium">Record business expenses directly to the Expenses sheet.</p>
      </div>
      <ExpenseEntry />
    </div>
  );
}
