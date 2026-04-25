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
import { useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ReceiptTemplate } from "./receipt-template";
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
}: RecordCardProps) {
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const { cachedSales } = useSyncStore();
  const [batchRecords, setBatchRecords] = useState<UnifiedRecord[]>([]);

  const statusColors: Record<RecordStatus, string> = {
    Settled:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
    "Part-payment":
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40",
    "In Progress":
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40",
    Syncing:
      "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 animate-pulse hover:bg-brand-100 dark:hover:bg-brand-900/40",
  };

  const handleGenerateReceipt = async () => {
    if (!record || record.type !== "Sale") return;

    setIsGeneratingReceipt(true);

    // Identify batch if salesId exists
    let recordsToPrint = [record];
    if (record.salesId) {
      const batch = (cachedSales as any[])
        .map((r) => {
          // Map raw record to UnifiedRecord format for the template
          // We reuse the mapping logic roughly or assume cachedSales is already mapped
          // Actually, cachedSales is Row[], so we need to map it if it's not already.
          // But in RecordCard, we expect UnifiedRecord[].
          // Let's assume we need to filter and map.
          return r;
        })
        .filter((r) => (r["SALES ID"] || r["Sales Id"]) === record.salesId);

      if (batch.length > 1) {
        // We need them as UnifiedRecords. The template expects UnifiedRecord[].
        // Since we are in RecordCard, we might not have a full mapper here.
        // However, the user request says: "filter the global cache for all records sharing that Sales ID".
        // Let's implement a quick map here or assume we have it.
        // For now, I'll filter the cachedSales which are usually Row objects.
        // I will map them to UnifiedRecord.

        recordsToPrint = batch.map((r: any) => ({
          id: r._rowIndex?.toString() || Math.random().toString(),
          date: r.DATE || r.Date || "N/A",
          type: "Sale",
          client: r["CLIENT NAME"] || r["Client Name"] || "N/A",
          description: r["JOB DESCRIPTION"] || r["Job Description"] || "—",
          amount: parseFloat(
            r["AMOUNT (₦)"]?.toString().replace(/[₦, \s]/g, "") || "0",
          ),
          balance: parseFloat(
            r["AMOUNT DIFFERENCES"]?.toString().replace(/[₦, \s]/g, "") || "0",
          ),
          status:
            r["PAYMENT STATUS"] === "Paid"
              ? "Settled"
              : r["PAYMENT STATUS"] === "Part-payment"
                ? "Part-payment"
                : "In Progress",
          loggedBy: r["Logged By"] || "Unknown",
          salesId: r["SALES ID"] || r["Sales Id"],
          isPending: false,
          raw: r,
        }));
      }
    }

    setBatchRecords(recordsToPrint);

    // Wait for state update and DOM render
    setTimeout(async () => {
      try {
        if (!receiptRef.current) {
          console.error("Receipt reference not found");
          setIsGeneratingReceipt(false);
          return;
        }

        // Wait for fonts and a couple of animation frames
        try {
          if (
            typeof document !== "undefined" &&
            (document as any).fonts?.ready
          ) {
            await (document as any).fonts.ready;
          }
        } catch (e) {}

        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));

        const canvas = await html2canvas(receiptRef.current, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: 800,
        });

        const imgData = canvas.toDataURL("image/png");

        if (imgData === "data:," || imgData.length < 100) {
          console.error(
            "Canvas is empty. html2canvas failed to capture the receipt.",
          );
          toast.error("Failed to capture receipt. Please try again.");
          setIsGeneratingReceipt(false);
          return;
        }

        const pdf = new jsPDF("p", "mm", "a4");

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // Calculate dimensions to maintain aspect ratio within A4
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const imgWidth = pageWidth;
        const imgHeight = (canvasHeight * imgWidth) / canvasWidth;

        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
        pdf.save(
          `Invoice_${record.salesId || record.client?.replace(/\s+/g, "_") || "Customer"}.pdf`,
        );
      } catch (error) {
        console.error("Failed to generate receipt", error);
      } finally {
        setIsGeneratingReceipt(false);
        setBatchRecords([]);
      }
    }, 500);
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
      ? "border-l-[3px] border-l-orange-400"
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
          <span className="text-xs font-semibold text-gray-500 dark:text-zinc-500 block leading-none mb-3">
            {date}
          </span>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase text-gray-500 block leading-none mb-1 tracking-wider">
              Amount
            </span>
            <span className="text-sm font-black text-gray-900 dark:text-white leading-none">
              ₦{amount.replace("₦", "").trim()}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold uppercase text-rose-400 dark:text-rose-500 block leading-none mb-1 tracking-wider">
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
            <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-tight leading-none mb-0.5">
              Client/Payee
            </p>
            <p className="text-sm font-bold text-gray-800 dark:text-zinc-100">
              {client}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              <span className="font-semibold text-gray-600 dark:text-zinc-300">
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
                disabled={isGeneratingReceipt}
                title="Download PDF Receipt"
              >
                {isGeneratingReceipt ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
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

      {/* Hidden receipt template for PDF generation */}
      <div
        className="fixed left-[-9999px] top-[-9999px] w-[800px] bg-white pointer-events-none"
        aria-hidden="true"
      >
        <ReceiptTemplate
          records={batchRecords.length > 0 ? batchRecords : record ? [record] : []}
          ref={receiptRef}
        />
      </div>
    </div>
  );
}
