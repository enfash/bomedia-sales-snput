"use client";

import {
  ManageSaleAction,
  type UnifiedRecord,
} from "@/components/manage-sale-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Printer, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MaterialBadge } from "./material-badge";
import { useState } from "react";
import { ReceiptModal } from "./receipt-modal";
import { WhatsAppReminder } from "./whatsapp-reminder";
import { useSyncStore } from "@/lib/store";
import { toast } from "sonner";

export type RecordStatus =
  | "Settled"
  | "Part-payment"
  | "In Progress"
  | "Syncing";

interface RecordCardProps {
  date: string;
  type: string;
  client: string;
  description: string;
  amount: string;
  status: RecordStatus;
  isPending?: boolean;
  record?: UnifiedRecord;
  onUpdate?: () => void;
  /** All sales records available on the current page — used for batch grouping by Sales ID */
  allSalesContext?: UnifiedRecord[];
}

export function RecordCard({
  date,
  type,
  client,
  description,
  amount,
  status,
  isPending,
  record,
  onUpdate,
  allSalesContext,
}: RecordCardProps) {
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const { pendingQueue } = useSyncStore();
  const [batchRecords, setBatchRecords] = useState<UnifiedRecord[]>([]);

  const statusColors: Record<RecordStatus, string> = {
    Settled:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
    "Part-payment":
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    "In Progress":
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40",
    Syncing:
      "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 animate-pulse hover:bg-brand-100 dark:hover:bg-brand-900/40",
  };

  const handleGenerateReceipt = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!record || record.type !== "Sale") return;

    const salesId = String(record.salesId || "").trim();

    if (salesId) {
      // 1. Search the page-level context (synced + pending already mapped to UnifiedRecord)
      const fromContext = (allSalesContext || []).filter(
        (s) => String(s.salesId || "").trim() === salesId && s.type === "Sale"
      );

      // 2. Also search pendingQueue items that share the same salesId (not yet in context)
      const fromPending: UnifiedRecord[] = pendingQueue
        .filter((item) => item.type === "sale" && item.data?.[22] === salesId)
        .map((item) => {
          const v = item.data;
          return {
            id: `pending-${item.id}`,
            date: v[0] || record.date,
            type: "Sale" as const,
            client: v[1] || record.client,
            contact: v[3] || record.contact || "",
            description: v[2] || record.description,
            amount: parseFloat(v[14] || "0"),
            status: "Syncing" as RecordStatus,
            loggedBy: v[21] || record.loggedBy,
            isPending: true,
            balance: 0,
            salesId,
            material: v[4] || "",
            raw: {},
          } as UnifiedRecord;
        });

      // Merge: context first (avoids duplicates from pending already being in context)
      const contextIds = new Set(fromContext.map((r) => r.id));
      const merged = [
        ...fromContext,
        ...fromPending.filter((r) => !contextIds.has(r.id)),
      ];

      setBatchRecords(merged.length > 0 ? merged : [record]);
    } else {
      setBatchRecords([record]);
    }

    setIsReceiptModalOpen(true);
  };

  let rollSize = "";
  let sqft = 0;
  let qty = 0;

  if (record?.raw) {
    const sizes = ["3FT", "4FT", "5FT", "6FT", "8FT", "10FT"];
    for (const size of sizes) {
      if (record.raw[size]) {
        const val = parseFloat(record.raw[size]);
        if (val > 0) {
          rollSize = size;
          sqft = val;
          break;
        }
      }
    }
    if (record.raw["QTY"]) {
      qty = parseFloat(record.raw["QTY"]) || 0;
    }
  }

  let displayDescription = description;
  let extractedDimension = "";

  if (description) {
    const dimMatch = description.match(/ \[(.*?)\]$/);
    if (dimMatch) {
      extractedDimension = dimMatch[1];
      displayDescription = description.substring(0, dimMatch.index).trim();
    }
  }

  // Left accent border by record type
  const isExpense = type === "Expense";
  const accentBorder = isPending
    ? "border-l-[3px] border-l-brand-400"
    : isExpense
      ? "border-l-[3px] border-l-primary/40"
      : "border-l-[3px] border-l-primary/50";

  return (
    <div
      className={cn(
        "p-5 bg-white dark:bg-zinc-900 border rounded-xl shadow-sm mb-2.5 transition-colors duration-300",
        accentBorder,
        isPending
          ? "border-brand-200 dark:border-brand-900/60 bg-brand-50/10 dark:bg-brand-900/10"
          : "border-gray-100 dark:border-zinc-800",
      )}
    >
      <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-50 dark:border-zinc-800/80">
        <div>
          <span className="text-xs font-semibold text-gray-600 dark:text-zinc-400 block leading-none mb-3">
            {date}
          </span>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase text-gray-600 block leading-none mb-1 tracking-wider">
              Amount
            </span>
            <span className="text-sm font-black text-gray-900 dark:text-white leading-none">
              ₦{amount.replace("₦", "").trim()}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold uppercase text-rose-500 dark:text-rose-400 block leading-none mb-1 tracking-wider">
            Difference
          </span>
          <span className="text-sm font-black text-rose-600 dark:text-rose-400 leading-none">
            {record?.type === "Sale"
              ? `₦${(record.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-tight leading-none mb-0.5">
              Client/Payee
            </p>
            <p className="text-sm font-bold text-gray-800 dark:text-zinc-100">
              {client}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-zinc-400">
              <span className="font-bold text-gray-700 dark:text-zinc-300">
                Description:
              </span>{" "}
              {displayDescription}
            </p>
            {rollSize && sqft > 0 && (
              <p className="text-[10px] text-gray-500 font-bold mt-1">
                Roll: {rollSize} (
                {extractedDimension ? extractedDimension : `${sqft} sqft`}) •
                Qty: {qty}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            {record?.type === "Sale" && record?.material && (
              <MaterialBadge material={record.material} />
            )}
            {record?.type === "Sale" && record?.jobStatus && (
              <Badge
                className={cn(
                  "text-[10px] px-2 py-0 rounded-full font-semibold border-none",
                  record.jobStatus === "Quoted" ||
                    record.jobStatus === "Pending"
                    ? "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"
                    : record.jobStatus === "Printing"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : record.jobStatus === "Finishing" ||
                          record.jobStatus === "In Progress"
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                        : record.jobStatus === "Ready"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : record.jobStatus === "Delivered" ||
                              record.jobStatus === "Completed"
                            ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                            : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400",
                )}
              >
                {record.jobStatus}
              </Badge>
            )}
            <Badge
              className={`text-[10px] px-2 py-0 rounded-full font-semibold border-none ${statusColors[status] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}
            >
              {status}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {record?.type === "Sale" && (
              <WhatsAppReminder
                clientName={record.client || client}
                contact={record.contact || ""}
                balance={record.balance || 0}
                jobDescription={displayDescription}
                variant="full"
              />
            )}
            {record?.type === "Sale" && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-primary dark:text-zinc-400"
                onClick={handleGenerateReceipt}
                title="Download PDF Receipt"
              >
                <Printer className="w-4 h-4" />
              </Button>
            )}

            {record && onUpdate ? (
              <ManageSaleAction
                record={record}
                onUpdate={onUpdate}
                variant="button"
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 dark:text-zinc-600"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <ReceiptModal 
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        records={batchRecords.length > 0 ? batchRecords : record ? [record] : []}
        salesId={record?.salesId}
      />
    </div>
  );
}
