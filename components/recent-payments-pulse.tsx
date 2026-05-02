import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Activity, ArrowRight, CircleDollarSign } from "lucide-react";
import { parseAmount } from "@/lib/financial-utils";

export function RecentPaymentsPulse({ payments }: { payments: any[] }) {
  // Sort payments by timestamp descending
  const sortedPayments = [...payments].sort((a, b) => {
    const timeA = new Date(a.TIMESTAMP || a.Timestamp).getTime();
    const timeB = new Date(b.TIMESTAMP || b.Timestamp).getTime();
    return timeB - timeA;
  });

  const recent = sortedPayments.slice(0, 5);
  const hasData = recent.length > 0;

  return (
    <Card className="glass overflow-hidden rounded-2xl transition-all duration-500 hover:shadow-xl flex flex-col h-full">
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
              const amount = parseAmount(payment.AMOUNT || payment.Amount);
              const dateStr = payment.TIMESTAMP || payment.Timestamp;
              const date = dateStr ? new Date(dateStr) : null;
              const timeAgo = date ? formatDistanceToNow(date, { addSuffix: true }) : "Unknown time";
              const type = payment["PAYMENT TYPE"] || payment["Payment Type"] || "Payment";
              
              return (
                <div key={payment["PAYMENT ID"] || idx} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <ArrowRight className="w-4 h-4 rotate-45" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground line-clamp-1">{type}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">+₦{amount.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground font-medium mt-0.5 max-w-[80px] truncate" title={payment["SALES ID"]}>
                      {payment["SALES ID"] || "No ID"}
                    </p>
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
