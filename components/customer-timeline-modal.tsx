"use client";

import { useMemo } from "react";
import { Drawer } from "vaul";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useSyncStore } from "@/lib/store";
import { parseAmount } from "@/lib/financial-utils";
import { format } from "date-fns";
import {
  Receipt, CreditCard, CheckCircle2, User, Phone,
  Calendar, Clock, X, ArrowRight, Package, AlertTriangle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  balanceBefore?: number;
  loggedBy?: string;
  collectedBy?: string;
  paymentType?: string;
  material?: string;
  salesId?: string;
  notes?: string;
  raw: any;
}

const avatarColors = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-cyan-500", "bg-amber-500",
];
const getAvatarColor = (name: string) =>
  avatarColors[(name?.charCodeAt(0) ?? 0) % avatarColors.length];

function PersonChip({ name, label }: { name: string; label: string }) {
  if (!name || name === "System") return null;
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0", getAvatarColor(name))}>
        {name[0]?.toUpperCase()}
      </div>
      <span className="text-[11px] font-bold text-gray-600 dark:text-zinc-400">
        <span className="text-gray-400 dark:text-zinc-500 font-medium">{label}: </span>{name}
      </span>
    </div>
  );
}

export function CustomerTimelineModal({ clientName, isOpen, onClose, contact }: CustomerTimelineModalProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { cachedSales, cachedPayments } = useSyncStore();

  const timelineEvents = useMemo(() => {
    if (!clientName) return [];
    const events: TimelineEvent[] = [];

    cachedSales.forEach((s) => {
      const name = (s["CLIENT NAME"] || s["Client Name"] || "").trim();
      if (name.toLowerCase() !== clientName.toLowerCase()) return;

      const amount = parseAmount(s["AMOUNT (₦)"] || s["Amount (₦)"]);
      const initialPay = parseAmount(s["INITIAL PAYMENT (₦)"] || s["Initial Payment (₦)"]);
      const addl1 = parseAmount(s["ADDITIONAL PAYMENT 1"] || s["Additional Payment 1"]);
      const addl2 = parseAmount(s["ADDITIONAL PAYMENT 2"] || s["Additional Payment 2"]);
      const balance = Math.max(0, amount - initialPay - addl1 - addl2);
      const dateStr = s["TIMESTAMP"] || s["DATE"] || s["Date"] || new Date().toISOString();

      events.push({
        id: `sale-${s["Sales ID"] || s["SALES ID"] || s._rowIndex}`,
        type: "SALE",
        date: dateStr,
        amount,
        description: s["JOB DESCRIPTION"] || s["Job Description"] || "Sale",
        status: balance <= 0 ? "Paid" : "Pending",
        balanceAfter: balance,
        loggedBy: s["Logged By"] || "",
        material: s["MATERIAL"] || s["Material"] || "",
        salesId: s["Sales ID"] || s["SALES ID"] || "",
        raw: s,
      });
    });

    cachedPayments.forEach((p) => {
      const name = (p["CLIENT NAME"] || "").trim();
      if (name.toLowerCase() !== clientName.toLowerCase()) return;

      const amount = parseAmount(p["AMOUNT"]);
      const dateStr = p["TIMESTAMP"] || p["DATE"] || new Date().toISOString();

      events.push({
        id: `pay-${p["PAYMENT ID"] || p._rowIndex}`,
        type: "PAYMENT",
        date: dateStr,
        amount,
        description: p["PAYMENT TYPE"] || "Payment",
        balanceAfter: parseAmount(p["BALANCE AFTER"]),
        balanceBefore: parseAmount(p["BALANCE BEFORE"]),
        collectedBy: p["COLLECTED BY"] || "",
        paymentType: p["PAYMENT TYPE"] || "",
        notes: p["NOTES"] || "",
        raw: p,
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [clientName, cachedSales, cachedPayments]);

  const stats = useMemo(() => {
    const sales = timelineEvents.filter(e => e.type === "SALE");
    const payments = timelineEvents.filter(e => e.type === "PAYMENT");
    const totalOrdered = sales.reduce((s, e) => s + e.amount, 0);
    const totalPaid = payments.reduce((s, e) => s + e.amount, 0);
    const totalDebt = sales.reduce((s, e) => s + (e.balanceAfter ?? 0), 0);
    return { orders: sales.length, paymentCount: payments.length, totalOrdered, totalPaid, totalDebt };
  }, [timelineEvents]);

  const body = (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-zinc-950">

      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex items-center gap-4 mb-4">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-black shrink-0", getAvatarColor(clientName ?? ""))}>
            {clientName?.[0]?.toUpperCase() ?? <User className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-gray-900 dark:text-white truncate">{clientName}</h2>
            {contact && (
              <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3 h-3" /> {contact}
              </p>
            )}
          </div>
          {stats.totalDebt > 0 ? (
            <div className="text-right shrink-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-0.5">Balance Due</p>
              <p className="text-lg font-black text-rose-600 dark:text-rose-400">₦{stats.totalDebt.toLocaleString()}</p>
            </div>
          ) : (
            <Badge className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900 shrink-0 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Cleared
            </Badge>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 dark:bg-zinc-900 rounded-xl p-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">Orders</p>
            <p className="text-base font-black text-primary">{stats.orders}</p>
          </div>
          <div className="bg-gray-50 dark:bg-zinc-900 rounded-xl p-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">Total Value</p>
            <p className="text-sm font-black text-gray-900 dark:text-white">₦{(stats.totalOrdered / 1000).toFixed(0)}k</p>
          </div>
          <div className="bg-gray-50 dark:bg-zinc-900 rounded-xl p-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">Paid</p>
            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">₦{(stats.totalPaid / 1000).toFixed(0)}k</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-5">
          Activity Timeline · {timelineEvents.length} events
        </p>

        <div className="relative border-l-2 border-gray-100 dark:border-zinc-800 ml-3 space-y-6">
          {timelineEvents.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 py-8 ml-4">No history found for this client.</p>
          ) : (
            timelineEvents.map((event) => {
              const isSale = event.type === "SALE";

              let formattedDate = "Unknown Date";
              let formattedTime = "";
              try {
                const d = new Date(event.date);
                if (!isNaN(d.getTime())) {
                  formattedDate = format(d, "MMM dd, yyyy");
                  formattedTime = format(d, "h:mm a");
                }
              } catch {}

              return (
                <div key={event.id} className="relative pl-8">
                  {/* Timeline dot */}
                  <div className={cn(
                    "absolute -left-[13px] top-2 w-6 h-6 rounded-full flex items-center justify-center border-4",
                    "border-slate-50 dark:border-zinc-950",
                    isSale
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
                      : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400"
                  )}>
                    {isSale ? <Receipt className="w-2.5 h-2.5" /> : <CreditCard className="w-2.5 h-2.5" />}
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">

                    {/* Top row: type badge + amount + date */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn(
                          "text-[9px] uppercase font-black tracking-wider border-0 px-2 py-0.5",
                          isSale
                            ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                            : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                        )}>
                          {isSale ? "Sale" : "Payment"}
                        </Badge>
                        {isSale && event.status && (
                          <Badge className={cn(
                            "text-[9px] uppercase font-black tracking-wider border-0 px-2 py-0.5",
                            event.status === "Paid"
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                          )}>
                            {event.status === "Paid" ? "Settled" : "Has Balance"}
                          </Badge>
                        )}
                        {!isSale && event.paymentType && (
                          <Badge className="text-[9px] uppercase font-black tracking-wider border-0 px-2 py-0.5 bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
                            {event.paymentType}
                          </Badge>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={cn(
                          "text-sm font-black",
                          isSale ? "text-gray-900 dark:text-white" : "text-emerald-600 dark:text-emerald-400"
                        )}>
                          {isSale ? "" : "+"} ₦{event.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-3 leading-snug">
                      {event.description}
                    </p>

                    {/* Material tag (sales only) */}
                    {isSale && event.material && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <Package className="w-3 h-3 text-gray-400" />
                        <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{event.material}</span>
                      </div>
                    )}

                    {/* Payment balance flow */}
                    {!isSale && (
                      <div className="flex items-center gap-2 mb-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl px-3 py-2">
                        <div className="text-center">
                          <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Before</p>
                          <p className="text-xs font-black text-rose-500">₦{(event.balanceBefore ?? 0).toLocaleString()}</p>
                        </div>
                        <ArrowRight className="w-3 h-3 text-gray-300 dark:text-zinc-600 mx-1" />
                        <div className="text-center">
                          <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">After</p>
                          <p className={cn(
                            "text-xs font-black",
                            (event.balanceAfter ?? 0) > 0 ? "text-amber-500" : "text-emerald-500"
                          )}>
                            ₦{(event.balanceAfter ?? 0).toLocaleString()}
                          </p>
                        </div>
                        {(event.balanceAfter ?? 0) <= 0 && (
                          <div className="ml-auto flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-black">Cleared</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sale remaining balance */}
                    {isSale && (event.balanceAfter ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 mb-3 bg-rose-50 dark:bg-rose-950/20 rounded-xl px-3 py-2">
                        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                          ₦{event.balanceAfter!.toLocaleString()} still outstanding
                        </span>
                      </div>
                    )}

                    {/* Footer: who + when */}
                    <div className="pt-3 border-t border-gray-50 dark:border-zinc-800/60 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        {isSale && event.loggedBy && (
                          <PersonChip name={event.loggedBy} label="Logged by" />
                        )}
                        {!isSale && event.collectedBy && (
                          <PersonChip name={event.collectedBy} label="Collected by" />
                        )}
                        {isSale && event.salesId && (
                          <span className="text-[10px] font-mono text-gray-300 dark:text-zinc-600">{event.salesId}</span>
                        )}
                        {!isSale && event.notes && (
                          <span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 italic">{event.notes}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400 dark:text-zinc-500 shrink-0">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formattedDate}</span>
                        {formattedTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formattedTime}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
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
