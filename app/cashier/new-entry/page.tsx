import { SalesEntry } from "@/components/sales-entry";

export default function CashierNewEntryPage() {
  return (
    <div className="p-6 md:p-8 min-h-screen">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-orange-600 dark:text-orange-400 tracking-tight">
          Log New Sale
        </h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1">
          Log a new print job for a customer.
        </p>
      </div>
      <SalesEntry />
    </div>
  );
}
