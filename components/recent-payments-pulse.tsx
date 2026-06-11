import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import { formatDistanceToNow } from "date-fns";
import { Activity, ArrowRight, CircleDollarSign, User, TrendingDown } from "lucide-react";
import { parseAmount } from "@/lib/financial-utils";

const PAYMENT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  "Initial Payment":      { bg: "#dbeafe", text: "#1d4ed8", label: "Initial" },
  "Additional Payment 1": { bg: "#fef3c7", text: "#b45309", label: "Addl. 1" },
  "Additional Payment 2": { bg: "#ede9fe", text: "#7c3aed", label: "Addl. 2" },
};

function getPaymentStyle(type: string) {
  return (
    PAYMENT_TYPE_STYLES[type] ?? {
      bg: "#d1fae5",
      text: "#065f46",
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
  "#ef4444", "#3b82f6", "#10b981",
  "#8b5cf6", "#f59e0b", "#06b6d4", "#f97316",
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
    <Card sx={{ overflow: "hidden", height: 420, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          <Box sx={{ p: 0.75, bgcolor: "primary.50", borderRadius: 2, color: "primary.main", display: "flex" }}>
            <Activity size={16} />
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
              Recent Payments Pulse
            </Typography>
            <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, color: "text.secondary" }}>
              Latest Incoming Cash
            </Typography>
          </Box>
        </Stack>
      </Box>

      <CardContent sx={{ p: 0, flexGrow: 1, overflowY: "auto", "&:last-child": { pb: 0 } }}>
        {!hasData ? (
          <Stack sx={{ alignItems: "center", justifyContent: "center", height: 200, textAlign: "center", px: 2 }}>
            <Box sx={{ width: 48, height: 48, borderRadius: "50%", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", mb: 1.5 }}>
              <CircleDollarSign size={24} color="#9ca3af" />
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block" }}>
              No recent payments.
            </Typography>
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
              Payments will appear here when logged.
            </Typography>
          </Stack>
        ) : (
          <Box>
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
                <Box
                  key={payment["PAYMENT ID"] || idx}
                  sx={{ p: 2, borderBottom: idx < recent.length - 1 ? "1px solid" : "none", borderColor: "divider", "&:hover": { bgcolor: "action.hover" }, transition: "background 0.2s" }}
                >
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1.5 }}>
                    <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, minWidth: 0 }}>
                      <Box
                        sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: getAvatarColor(clientName), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                      >
                        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                          {getInitials(clientName) || <User size={16} />}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 900, color: "text.primary", display: "block" }} noWrap>
                          {clientName}
                        </Typography>
                        <Box
                          component="span"
                          sx={{ display: "inline-block", mt: 0.25, fontSize: "0.5625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, px: 0.75, py: 0.25, borderRadius: 1, bgcolor: style.bg, color: style.text }}
                        >
                          {style.label}
                        </Box>
                      </Box>
                    </Stack>

                    <Typography variant="body2" sx={{ fontWeight: 900, color: "#059669", flexShrink: 0, fontFamily: "monospace" }}>
                      +₦{amount.toLocaleString()}
                    </Typography>
                  </Stack>

                  {(balanceBefore > 0 || balanceAfter >= 0) && (
                    <Stack direction="row" sx={{ mt: 1, pl: 6, alignItems: "center", gap: 0.5 }}>
                      <TrendingDown size={12} color="#9ca3af" />
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>Debt:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "#ef4444", fontFamily: "monospace" }}>
                        ₦{balanceBefore.toLocaleString()}
                      </Typography>
                      <ArrowRight size={10} color="#9ca3af" />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: balanceAfter <= 0 ? "#059669" : "#d97706", fontFamily: "monospace" }}>
                        {balanceAfter <= 0 ? "Cleared" : `₦${balanceAfter.toLocaleString()}`}
                      </Typography>
                    </Stack>
                  )}

                  {notes && notes !== `Logged via Manage Sale Action` && (
                    <Typography variant="caption" sx={{ display: "block", mt: 0.75, pl: 6, color: "text.secondary", fontStyle: "italic" }} noWrap>
                      "{notes}"
                    </Typography>
                  )}

                  <Stack direction="row" sx={{ mt: 1, pl: 6, alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                    {collectedBy && (
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", fontSize: "0.5625rem" }}>
                        By {collectedBy}
                      </Typography>
                    )}
                    {collectedBy && (
                      <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.5625rem" }}>·</Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.5625rem" }}>{timeAgo}</Typography>
                    {salesId && (
                      <>
                        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.5625rem" }}>·</Typography>
                        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: "0.5625rem" }}>{salesId}</Typography>
                      </>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
