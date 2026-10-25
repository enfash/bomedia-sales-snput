"use client";

import { ExpensesPage } from "@/components/expenses/expenses-page";

export type { Expense } from "@/lib/expense-list";

export default function Page() {
  return <ExpensesPage />;
}
