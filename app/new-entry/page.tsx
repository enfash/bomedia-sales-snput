import { SalesEntry } from "@/components/sales-entry";
import { PlusCircle } from "lucide-react";

export default function NewEntryPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Log New Sale Entry</h1>
        <p className="text-gray-500">Log a new print job using manual entry or AI natural language.</p>
      </div>
      <SalesEntry />
    </div>
  );
}
