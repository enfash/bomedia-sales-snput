import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Activity, ArrowRight, CircleDollarSign, User, TrendingDown } from "lucide-react";
import { parseAmount } from "@/lib/financial-utils";

const PAYMENT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  "Initial Payment":      { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-700 dark:text-blue-300",   label: "Initial" },
  "Additional Payment 1": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Addl. 1" },
  "Additional Payment 2": { bg: "bg-violet-100 dark:bg-violet-900/30",text: "text-violet-700 dark:text-violet-300",label: "Addl. 2" },
};

function getPaymentStyle(type: string) {
  return (
    PAYMENT_TYPE_STYLES[type] ?? {
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      text: "text-emerald-700 dark:text-emerald-300",
      label: type || "Payment",
    }
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-rose-500", "bg-blue-500", "bg-emerald-500",
  "bg-violet-500", "bg-amber-500", "bg-cyan-500", "bg-orange-500",
];
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export function RecentPaymentsPulse({ payments }: { payments: any[] }) {
  const sortedPayments = [...payments].sort((a, b) => {
    const timeA = new Date(a.TIMESTAMP || a.Timestamp).getTime();
    const timeB = new Date(b.TIMESTAMP || b.Timestamp).getTime();
    return timeB - timeA;
  });

  const recent = sortedPayments.slice(0, 6);
  const hasData = recent.length > 0;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-all duration-500 hover:shadow-xl flex flex-col h-[420px]">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-50 dark:bg-brand-900/30 rounded-lg text-brand-600 dark:text-brand-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-foreground">Recent Payments Pulse</CardTitle>
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold">Latest Incoming Cash</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-y-auto">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-center px-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <CircleDollarSign className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-xs font-bold text-muted-foreground">No recent payments.</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Payments will appear here when logged.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {recent.map((payment, idx) => {
              const amount        = parseAmount(payment.AMOUNT || payment.Amount);
              const balanceBefore = parseAmount(payment["BALANCE BEFORE"] || payment["Balance Before"]);
              const balanceAfter  = parseAmount(payment["BALANCE AFTER"]  || payment["Balance After"]);
              const clientName    = (payment["CLIENT NAME"] || payment["Client Name"] || "Unknown").trim();
              const collectedBy   = payment["COLLECTED BY"] || payment["Collected By"] || "";
              const notes         = payment["NOTES"] || payment["Notes"] || "";
              const salesId       = payment["SALES ID"] || payment["Sales Id"] || "";
              const type          = payment["PAYMENT TYPE"] || payment["Payment Type"] || "Payment";
              const dateStr       = payment.TIMESTAMP || payment.Timestamp;
              const date          = dateStr ? new Date(dateStr) : null;
              const timeAgo       = date ? formatDistanceToNow(date, { addSuffix: true }) : "Unknown time";
              const style         = getPaymentStyle(type);
              const debtDropped   = balanceBefore > 0 && balanceAfter < balanceBefore;

              return (
                <div
                  key={payment["PAYMENT ID"] || idx}
                  className="p-4 hover:bg-muted/30 transition-colors group"
                >
                  {/* Row 1: Avatar + Client name + Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full ${getAvatarColor(clientName)} flex items-center justify-center shrink-0`}
                      >
                        <span className="text-[11px] font-black text-white leading-none">
                          {getInitials(clientName) || <User className="w-4 h-4" />}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-foreground truncate">{clientName}</p>
                        {/* Payment type badge */}
                        <span
                          className={`inline-block mt-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
                        >
                          {style.label}
                        </span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        +₦{amount.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Balance before → after */}
                  {(balanceBefore > 0 || balanceAfter >= 0) && (
                    <div className="mt-2 flex items-center gap-1.5 pl-12">
                      <TrendingDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground font-medium">
                        Debt:
                      </span>
                      <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400">
                        ₦{balanceBefore.toLocaleString()}
                      </span>
                      <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      <span
                        className={`text-[10px] font-bold ${
                          balanceAfter <= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {balanceAfter <= 0 ? "Cleared" : `₦${balanceAfter.toLocaleString()}`}
                      </span>
                    </div>
                  )}

                  {/* Row 3: Notes (if any) */}
                  {notes && notes !== `Logged via Manage Sale Action` && (
                    <p className="mt-1.5 pl-12 text-[10px] text-muted-foreground italic truncate">
                      "{notes}"
                    </p>
                  )}

                  {/* Row 4: Meta — collected by, time ago, sales ID */}
                  <div className="mt-2 pl-12 flex items-center gap-2 flex-wrap">
                    {collectedBy && (
                      <span className="text-[9px] font-bold text-muted-foreground">
                        By {collectedBy}
                      </span>
                    )}
                    {collectedBy && <span className="text-muted-foreground/40 text-[9px]">·</span>}
                    <span className="text-[9px] text-muted-foreground">{timeAgo}</span>
                    {salesId && (
                      <>
                        <span className="text-muted-foreground/40 text-[9px]">·</span>
                        <span className="text-[9px] text-muted-foreground/60 font-mono">{salesId}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
