"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WhatsAppReminderProps {
  clientName: string;
  contact: string;
  balance: number;
  jobDescription?: string;
  /** "icon" = icon-only button (for table rows), "full" = labelled button (for cards) */
  variant?: "icon" | "full";
  className?: string;
}

function buildMessage(clientName: string, balance: number, jobDescription?: string): string {
  const formattedBalance = balance.toLocaleString("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  });

  const jobLine = jobDescription && jobDescription !== "—"
    ? `regarding your job: *${jobDescription}*`
    : "regarding your recent order";

  return (
    `Hello *${clientName}*, this is a gentle reminder from *BOMedia* ${jobLine}.\n\n` +
    `You have an outstanding balance of *${formattedBalance}*.\n\n` +
    `Kindly arrange payment at your earliest convenience. Thank you! 🙏`
  );
}

function sanitizePhone(contact: string): string {
  // Strip everything except digits, then normalise Nigerian numbers to intl format
  let digits = contact.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "234" + digits.slice(1); // 0801... → 2348011...
  }
  return digits;
}

export function WhatsAppReminder({
  clientName,
  contact,
  balance,
  jobDescription,
  variant = "icon",
  className,
}: WhatsAppReminderProps) {
  // Only render if there's an actual outstanding balance
  if (!balance || balance <= 0) return null;

  const phone = sanitizePhone(contact || "");
  const message = buildMessage(clientName, balance, jobDescription);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`; // No number → opens WA picker

  if (variant === "full") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-[10px] font-black rounded-lg border-emerald-200 dark:border-emerald-800/60",
            "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
            "hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-800"
          )}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Remind
        </Button>
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`WhatsApp reminder → ${clientName}`}>
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-lg border-emerald-200 dark:border-emerald-800/60",
          "text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10",
          "hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700",
          className
        )}
      >
        <MessageCircle className="w-4 h-4" />
      </Button>
    </a>
  );
}
