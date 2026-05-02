"use client";

import { useMemo } from "react";
import { Drawer } from "vaul";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useSyncStore } from "@/lib/store";
import { parseAmount } from "@/lib/financial-utils";
import { format, parseISO } from "date-fns";
import { Receipt, CreditCard, ChevronRight, CheckCircle2, User, Phone, MapPin, Calendar, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CustomerTimelineModalProps {
  clientName: string | null;
  isOpen: boolean;
  onClose: () => void;
  contact?: string;
}

interface TimelineEvent {
  id: string;
  type: "SALE" | "PAYMENT";
  date: string;
  amount: number;
  description: string;
  status?: string;
  balanceAfter?: number;
  raw: any;
}

export function CustomerTimelineModal({ clientName, isOpen, onClose, contact }: CustomerTimelineModalProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { cachedSales, cachedPayments } = useSyncStore();

  const timelineEvents = useMemo(() => {
    if (!clientName) return [];

    const events: TimelineEvent[] = [];

    // Map Sales
    cachedSales.forEach((s) => {
      const name = (s["CLIENT NAME"] || s["Client Name"] || "").trim();
      if (name.toLowerCase() === clientName.toLowerCase()) {
        const amount = parseAmount(s["TOTAL"] || s["Total"] || s["AMOUNT (₦)"] || s["Amount (₦)"]);
        const balance = parseAmount(s["AMOUNT DIFFERENCES"] || s["Amount Differences"] || s["BALANCE"] || s["Balance"]);
        const dateStr = s["TIMESTAMP"] || s["DATE"] || s["Date"] || new Date().toISOString();
        
        events.push({
          id: `sale-${s["SALES ID"] || s._rowIndex}`,
          type: "SALE",
          date: dateStr,
          amount,
          description: s["JOB DESCRIPTION"] || s["Job Description"] || "Sale",
          status: balance <= 0 ? "Paid" : "Pending",
          balanceAfter: balance,
          raw: s
        });
      }
    });

    // Map Payments
    cachedPayments.forEach((p) => {
      const name = (p["CLIENT NAME"] || "").trim();
      if (name.toLowerCase() === clientName.toLowerCase()) {
        const amount = parseAmount(p["AMOUNT"]);
        const dateStr = p["TIMESTAMP"] || p["DATE"] || new Date().toISOString();
        
        events.push({
          id: `pay-${p["PAYMENT ID"] || p._rowIndex}`,
          type: "PAYMENT",
          date: dateStr,
          amount,
          description: p["PAYMENT TYPE"] || "Payment",
          balanceAfter: parseAmount(p["BALANCE AFTER"]),
          raw: p
        });
      }
    });

    // Sort descending by date
    return events.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA; // newest first
    });

  }, [clientName, cachedSales, cachedPayments]);

  const totalDebt = useMemo(() => {
    if (!clientName) return 0;
    // Calculate total debt from sales
    return cachedSales
      .filter((s) => (s["CLIENT NAME"] || s["Client Name"] || "").trim().toLowerCase() === clientName.toLowerCase())
      .reduce((sum, s) => sum + Math.max(0, parseAmount(s["AMOUNT DIFFERENCES"] || s["Amount Differences"] || s["BALANCE"] || s["Balance"])), 0);
  }, [clientName, cachedSales]);

  const body = (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-zinc-950/50">
      <div className="p-6 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-gray-900 dark:text-white truncate">{clientName}</h2>
            {contact && (
              <p className="text-sm font-medium text-gray-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1">
                <Phone className="w-3.5 h-3.5" /> {contact}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-1">
              Total Debt
            </p>
            {totalDebt > 0 ? (
              <p className="text-lg font-black text-rose-600">₦{totalDebt.toLocaleString()}</p>
            ) : (
              <Badge className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Cleared
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="py-6">
          <h3 className="text-sm font-black text-gray-900 dark:text-white mb-6">Timeline</h3>
          
          <div className="relative border-l-2 border-gray-100 dark:border-zinc-800 ml-4 space-y-8">
            {timelineEvents.length === 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-zinc-500 py-8 ml-[-1rem]">
                No history found for this client.
              </p>
            ) : (
              timelineEvents.map((event) => {
                const isSale = event.type === "SALE";
                const Icon = isSale ? Receipt : CreditCard;
                
                // Format the date carefully to handle potential invalid dates
                let formattedDate = "Unknown Date";
                let formattedTime = "";
                try {
                  const d = new Date(event.date);
                  if (!isNaN(d.getTime())) {
                    formattedDate = format(d, "MMM dd, yyyy");
                    formattedTime = format(d, "h:mm a");
                  }
                } catch (e) {}

                return (
                  <div key={event.id} className="relative pl-8">
                    <div className={`absolute -left-[13px] top-1 w-6 h-6 rounded-full flex items-center justify-center border-4 border-slate-50 dark:border-zinc-950 ${
                      isSale ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400"
                    }`}>
                      <Icon className="w-3 h-3" />
                    </div>

                    <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-[10px] uppercase font-black tracking-wider border-0 ${
                              isSale ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                            }`}>
                              {event.type}
                            </Badge>
                            {isSale && event.status && (
                              <Badge variant="outline" className={`text-[10px] uppercase font-black tracking-wider border-0 ${
                                event.status === "Paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                              }`}>
                                {event.status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1.5">
                            {event.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-black ${isSale ? "text-gray-900 dark:text-white" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {isSale ? "" : "+"}₦{event.amount.toLocaleString()}
                          </p>
                          <div className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 mt-1 flex flex-col items-end gap-0.5">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formattedDate}</span>
                            {formattedTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formattedTime}</span>}
                          </div>
                        </div>
                      </div>
                      
                      {/* Optional extra details based on type */}
                      <div className="mt-3 pt-3 border-t border-gray-50 dark:border-zinc-800/50 flex justify-between items-center text-xs font-medium text-gray-500 dark:text-zinc-400">
                        {isSale ? (
                          <>
                            <span>ID: {event.raw["SALES ID"] || "N/A"}</span>
                            {event.balanceAfter && event.balanceAfter > 0 ? (
                              <span className="text-rose-500">Left to pay: ₦{event.balanceAfter.toLocaleString()}</span>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <span>Collected by: {event.raw["COLLECTED BY"] || "System"}</span>
                            <span>Remaining: ₦{(event.balanceAfter || 0).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-sm" />
          <Drawer.Content className="bg-slate-50 dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] fixed bottom-0 left-0 right-0 z-[201] outline-none shadow-2xl border-t dark:border-zinc-800 h-[90vh]">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mt-4 mb-2 z-10" />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-full bg-white/50 dark:bg-zinc-900/50 hover:bg-gray-200 dark:hover:bg-zinc-800 z-10"
              onClick={onClose}
            >
              <X className="w-5 h-5 text-gray-500" />
            </Button>
            <div className="flex-1 overflow-hidden rounded-t-[2.5rem]">
              {body}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-white dark:bg-zinc-950 rounded-[2rem] p-0 border-none shadow-2xl overflow-hidden h-[85vh] flex flex-col z-[201]">
        <DialogHeader className="sr-only">
          <DialogTitle>Customer Timeline</DialogTitle>
          <DialogDescription>History of sales and payments for {clientName}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
