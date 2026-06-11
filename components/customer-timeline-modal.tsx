"use client";

import { useMemo } from "react";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useSyncStore } from "@/lib/store";
import { parseAmount } from "@/lib/financial-utils";
import { format } from "date-fns";
import {
  Receipt, CreditCard, CheckCircle2, User, Phone,
  Calendar, Clock, X, ArrowRight, Package, AlertTriangle
} from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

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

const avatarBgColors = [
  "#8b5cf6", "#3b82f6", "#10b981",
  "#f97316", "#f43f5e", "#06b6d4", "#f59e0b",
];
const getAvatarColor = (name: string) =>
  avatarBgColors[(name?.charCodeAt(0) ?? 0) % avatarBgColors.length];

function PersonChip({ name, label }: { name: string; label: string }) {
  if (!name || name === "System") return null;
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
      <Box sx={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        bgcolor: getAvatarColor(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, color: "#fff" }}>
          {name[0]?.toUpperCase()}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary" }}>
        <Box component="span" sx={{ fontWeight: 500, color: "text.disabled" }}>{label}: </Box>
        {name}
      </Typography>
    </Stack>
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
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
      <Box sx={{
        p: 2.5,
        borderBottom: "1px solid",
        borderColor: "grey.100",
        bgcolor: "background.paper",
        flexShrink: 0,
      }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 2, mb: 2 }}>
          <Box sx={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            bgcolor: getAvatarColor(clientName ?? ""),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "#fff" }}>
              {clientName?.[0]?.toUpperCase() ?? <User size={20} />}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {clientName}
            </Typography>
            {contact && (
              <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, mt: 0.25 }}>
                <Phone size={12} />
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
                  {contact}
                </Typography>
              </Stack>
            )}
          </Box>
          {stats.totalDebt > 0 ? (
            <Box sx={{ textAlign: "right", flexShrink: 0 }}>
              <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "error.light", mb: 0.25 }}>
                Balance Due
              </Typography>
              <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "error.main" }}>
                ₦{stats.totalDebt.toLocaleString()}
              </Typography>
            </Box>
          ) : (
            <Chip
              icon={<CheckCircle2 size={12} />}
              label="Cleared"
              size="small"
              sx={{
                bgcolor: "#f0fdf4",
                color: "#16a34a",
                border: "1px solid #bbf7d0",
                fontWeight: 700,
                fontSize: "0.75rem",
                flexShrink: 0,
              }}
            />
          )}
        </Stack>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
          {[
            { label: "Orders", value: String(stats.orders), color: "primary.main" },
            { label: "Total Value", value: `₦${(stats.totalOrdered / 1000).toFixed(0)}k`, color: "text.primary" },
            { label: "Paid", value: `₦${(stats.totalPaid / 1000).toFixed(0)}k`, color: "success.main" },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ bgcolor: "grey.50", borderRadius: 2, p: 1.5, textAlign: "center" }}>
              <Typography sx={{ fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.disabled", mb: 0.5 }}>
                {label}
              </Typography>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 3 }}>
        <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.disabled", mb: 2.5 }}>
          Activity Timeline · {timelineEvents.length} events
        </Typography>

        <Box sx={{ position: "relative", borderLeft: "2px solid", borderColor: "grey.100", ml: 1.5 }}>
          {timelineEvents.length === 0 ? (
            <Typography sx={{ fontSize: "0.875rem", color: "text.disabled", py: 4, ml: 2 }}>
              No history found for this client.
            </Typography>
          ) : (
            <Stack sx={{ gap: 3 }}>
              {timelineEvents.map((event) => {
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
                  <Box key={event.id} sx={{ position: "relative", pl: 4 }}>
                    <Box sx={{
                      position: "absolute",
                      left: -13,
                      top: 8,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "4px solid", borderColor: "background.default",
                      bgcolor: isSale ? "#dbeafe" : "#d1fae5",
                      color: isSale ? "#2563eb" : "#16a34a",
                    }}>
                      {isSale ? <Receipt size={10} /> : <CreditCard size={10} />}
                    </Box>

                    <Box sx={{
                      bgcolor: "background.paper",
                      border: "1px solid",
                      borderColor: "grey.100",
                      borderRadius: 3,
                      p: 2,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                          <Chip
                            label={isSale ? "Sale" : "Payment"}
                            size="small"
                            sx={{
                              fontSize: "0.5625rem",
                              fontWeight: 900,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              height: 20,
                              bgcolor: isSale ? "#eff6ff" : "#f0fdf4",
                              color: isSale ? "#2563eb" : "#16a34a",
                            }}
                          />
                          {isSale && event.status && (
                            <Chip
                              label={event.status === "Paid" ? "Settled" : "Has Balance"}
                              size="small"
                              sx={{
                                fontSize: "0.5625rem",
                                fontWeight: 900,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                height: 20,
                                bgcolor: event.status === "Paid" ? "#f0fdf4" : "#fffbeb",
                                color: event.status === "Paid" ? "#16a34a" : "#d97706",
                              }}
                            />
                          )}
                          {!isSale && event.paymentType && (
                            <Chip
                              label={event.paymentType}
                              size="small"
                              sx={{
                                fontSize: "0.5625rem",
                                fontWeight: 900,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                height: 20,
                                bgcolor: "#f5f3ff",
                                color: "#7c3aed",
                              }}
                            />
                          )}
                        </Stack>
                        <Box sx={{ textAlign: "right", flexShrink: 0, ml: 1 }}>
                          <Typography sx={{
                            fontSize: "0.875rem",
                            fontWeight: 900,
                            color: isSale ? "text.primary" : "success.main",
                          }}>
                            {isSale ? "" : "+"} ₦{event.amount.toLocaleString()}
                          </Typography>
                        </Box>
                      </Stack>

                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: "text.primary", mb: 1.5, lineHeight: 1.4 }}>
                        {event.description}
                      </Typography>

                      {isSale && event.material && (
                        <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, mb: 1.5 }}>
                          <Package size={12} color="#9ca3af" />
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
                            {event.material}
                          </Typography>
                        </Stack>
                      )}

                      {!isSale && (
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 1.5, bgcolor: "grey.50", borderRadius: 2, px: 1.5, py: 1 }}>
                          <Box sx={{ textAlign: "center" }}>
                            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "text.disabled", textTransform: "uppercase", mb: 0.25 }}>Before</Typography>
                            <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: "error.main" }}>₦{(event.balanceBefore ?? 0).toLocaleString()}</Typography>
                          </Box>
                          <ArrowRight size={12} color="#d1d5db" />
                          <Box sx={{ textAlign: "center" }}>
                            <Typography sx={{ fontSize: "0.5625rem", fontWeight: 700, color: "text.disabled", textTransform: "uppercase", mb: 0.25 }}>After</Typography>
                            <Typography sx={{ fontSize: "0.75rem", fontWeight: 900, color: (event.balanceAfter ?? 0) > 0 ? "#f59e0b" : "success.main" }}>
                              ₦{(event.balanceAfter ?? 0).toLocaleString()}
                            </Typography>
                          </Box>
                          {(event.balanceAfter ?? 0) <= 0 && (
                            <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, ml: "auto", color: "success.main" }}>
                              <CheckCircle2 size={14} />
                              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900 }}>Cleared</Typography>
                            </Stack>
                          )}
                        </Stack>
                      )}

                      {isSale && (event.balanceAfter ?? 0) > 0 && (
                        <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, mb: 1.5, bgcolor: "#fff1f2", borderRadius: 2, px: 1.5, py: 1 }}>
                          <AlertTriangle size={12} color="#f87171" />
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "error.main" }}>
                            ₦{event.balanceAfter!.toLocaleString()} still outstanding
                          </Typography>
                        </Stack>
                      )}

                      <Box sx={{ pt: 1.5, borderTop: "1px solid", borderColor: "grey.50", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                          {isSale && event.loggedBy && (
                            <PersonChip name={event.loggedBy} label="Logged by" />
                          )}
                          {!isSale && event.collectedBy && (
                            <PersonChip name={event.collectedBy} label="Collected by" />
                          )}
                          {isSale && event.salesId && (
                            <Typography sx={{ fontSize: "0.625rem", fontFamily: "monospace", color: "text.disabled" }}>
                              {event.salesId}
                            </Typography>
                          )}
                          {!isSale && event.notes && (
                            <Typography sx={{ fontSize: "0.625rem", fontWeight: 500, color: "text.secondary", fontStyle: "italic" }}>
                              {event.notes}
                            </Typography>
                          )}
                        </Stack>
                        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                            <Calendar size={12} color="#9ca3af" />
                            <Typography sx={{ fontSize: "0.625rem", fontWeight: 500, color: "text.secondary" }}>
                              {formattedDate}
                            </Typography>
                          </Stack>
                          {formattedTime && (
                            <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                              <Clock size={12} color="#9ca3af" />
                              <Typography sx={{ fontSize: "0.625rem", fontWeight: 500, color: "text.secondary" }}>
                                {formattedTime}
                              </Typography>
                            </Stack>
                          )}
                        </Stack>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <Dialog
        fullScreen
        open={isOpen}
        onClose={onClose}

        slotProps={{
          paper: {
            sx: {
              mt: "10vh",
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              bgcolor: "background.default",
              display: "flex",
              flexDirection: "column",
            }
          }
        }}
        sx={{
          "& .MuiDialog-container": {
            alignItems: "flex-end",
          }
        }}
      >
        <Box sx={{ width: 48, height: 6, borderRadius: 3, bgcolor: "divider", mx: "auto", mt: 2, mb: 1, flexShrink: 0 }} />
        <Button
          variant="text"
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 16,
            top: 16,
            minWidth: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            bgcolor: "action.hover",
            "&:hover": { bgcolor: "action.selected" },
            zIndex: 10,
            p: 0,
          }}
        >
          <X size={20} color="#6b7280" />
        </Button>
        <Box sx={{ flex: 1, overflow: "hidden", borderRadius: "2.5rem 2.5rem 0 0" }}>
          {body}
        </Box>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 4,
            overflow: "hidden",
            height: "85vh",
            display: "flex",
            flexDirection: "column",
            zIndex: 201,
          },
        },
      }}
    >
      <DialogTitle sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
        Customer Timeline — {clientName}
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        {body}
      </DialogContent>
    </Dialog>
  );
}
