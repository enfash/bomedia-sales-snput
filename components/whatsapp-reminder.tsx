"use client";

import { MessageCircle } from "lucide-react";
import { Button, IconButton } from "@mui/material";

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

  const jobLine =
    jobDescription && jobDescription !== "—"
      ? `regarding your job: *${jobDescription}*`
      : "regarding your recent order";

  return (
    `Hello *${clientName}*, this is a gentle reminder from *BOMedia* ${jobLine}.\n\n` +
    `You have an outstanding balance of *${formattedBalance}*.\n\n` +
    `Kindly arrange payment at your earliest convenience. Thank you! 🙏`
  );
}

function sanitizePhone(contact: string): string {
  let digits = contact.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "234" + digits.slice(1);
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
  if (!balance || balance <= 0) return null;

  const phone = sanitizePhone(contact || "");
  const message = buildMessage(clientName, balance, jobDescription);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  const emeraldSx = {
    borderColor: "#6ee7b7",
    color: "#059669",
    bgcolor: "rgba(236,253,245,0.8)",
    "&:hover": {
      bgcolor: "rgba(209,250,229,0.9)",
      borderColor: "#34d399",
      color: "#047857",
    },
  };

  if (variant === "full") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<MessageCircle size={14} />}
          sx={{
            height: 32,
            fontSize: "10px",
            fontWeight: 900,
            borderRadius: 2,
            textTransform: "none",
            ...emeraldSx,
          }}
        >
          Remind
        </Button>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`WhatsApp reminder → ${clientName}`}
      className={className}
    >
      <IconButton
        size="small"
        sx={{
          width: 32,
          height: 32,
          borderRadius: 2,
          border: "1px solid",
          ...emeraldSx,
        }}
      >
        <MessageCircle size={16} />
      </IconButton>
    </a>
  );
}
