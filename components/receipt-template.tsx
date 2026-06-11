"use client";

import { forwardRef } from "react";
import { UnifiedRecord } from "./manage-sale-action";
import { format } from "date-fns";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface ReceiptTemplateProps {
  records: UnifiedRecord[];
}

export const ReceiptTemplate = forwardRef<HTMLDivElement, ReceiptTemplateProps>(
  ({ records }, ref) => {
    if (!records || records.length === 0) return null;

    const primary = records[0];

    // Receipt / order reference
    const uniqueSalesIds = Array.from(
      new Set(
        records
          .map((r) => r.salesId?.trim())
          .filter((id) => id && id !== "")
      )
    );

    const salesIdDisplay =
      uniqueSalesIds.length > 0
        ? uniqueSalesIds.join(", ")
        : `INV-${String(primary.rowIndex || Math.floor(Math.random() * 10000)).padStart(5, "0")}`;

    // Date from primary record
    let recordDate = new Date();
    try {
      if (primary.date) {
        const d = new Date(primary.date);
        if (!isNaN(d.getTime())) recordDate = d;
      }
    } catch {}

    // Aggregated financials
    const grandTotal = records.reduce((s, r) => s + (r.amount ?? 0), 0);
    const totalBalance = records.reduce((s, r) => s + (r.balance ?? 0), 0);
    const totalPaid = grandTotal - totalBalance;

    // Determine if any material present
    const hasMaterial = records.some((r) => r.material && r.material.trim() !== "");

    return (
      <Box
        ref={ref}
        sx={{
          bgcolor: "#ffffff",
          p: 6,
          color: "grey.900",
          fontFamily: "Inter, sans-serif",
          width: 800,
          minHeight: 1131, // A4 Ratio
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "2px solid",
            borderColor: "grey.100",
            pb: 3,
            mb: 3,
          }}
        >
          <Box>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 1 }}>
              <Box
                component="img"
                src="/bomedia-icon.svg"
                alt="BOMedia Logo"
                sx={{
                  width: 32,
                  height: 32,
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontWeight: 900, fontSize: "1.5rem", letterSpacing: "-0.05em", color: "grey.900" }}>
                BOMedia.
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.75rem", color: "grey.500", maxWidth: 200 }}>
              Large Format Printing, Branding & Digital Services
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontSize: "1.875rem", fontWeight: 900, color: "grey.200", letterSpacing: "0.1em", textTransform: "uppercase", mb: 1 }}>
              Invoice
            </Typography>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: "bold", color: "grey.800" }}>
              {uniqueSalesIds.length > 1 ? "IDs: " : "#"}{salesIdDisplay}
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "grey.500", mt: 0.5 }}>
              {format(recordDate, "MMM dd, yyyy")}
            </Typography>
          </Box>
        </Stack>

        {/* Customer Details */}
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: "bold", color: "grey.400", textTransform: "uppercase", letterSpacing: "0.1em", mb: 0.5 }}>
            Billed To
          </Typography>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 900, color: "grey.800" }}>
            {primary.client}
          </Typography>
          {primary.contact && (
            <Typography sx={{ fontSize: "0.875rem", color: "grey.600", mt: 0.25 }}>
              {primary.contact}
            </Typography>
          )}
        </Box>

        {/* Line Items Table */}
        <Box sx={{ mb: 4, border: "1px solid", borderColor: "grey.100", borderRadius: 3, overflow: "hidden" }}>
          <Box component="table" sx={{ width: "100%", textAlign: "left", fontSize: "0.875rem", borderCollapse: "collapse" }}>
            <Box component="thead" sx={{ bgcolor: "grey.50", color: "grey.500", fontWeight: "bold", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <tr>
                <Box component="th" sx={{ px: 2, py: 1.5, width: 24, textAlign: "center" }}>#</Box>
                <Box component="th" sx={{ px: 2, py: 1.5 }}>Description</Box>
                {hasMaterial && <Box component="th" sx={{ px: 2, py: 1.5 }}>Material</Box>}
                <Box component="th" sx={{ px: 2, py: 1.5, textAlign: "right" }}>Amount</Box>
                <Box component="th" sx={{ px: 2, py: 1.5, textAlign: "right" }}>Balance</Box>
              </tr>
            </Box>
            <Box component="tbody" sx={{ "& tr:not(:last-of-type)": { borderBottom: "1px solid", borderColor: "grey.100" } }}>
              {records.map((r, idx) => (
                <tr key={r.id ?? idx}>
                  <Box component="td" sx={{ px: 2, py: 1.5, textAlign: "center", color: "grey.400", fontSize: "0.75rem", fontWeight: "bold" }}>
                    {idx + 1}
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontWeight: 500, color: "grey.900" }}>
                    {r.description}
                  </Box>
                  {hasMaterial && (
                    <Box component="td" sx={{ px: 2, py: 1.5, color: "grey.600", fontSize: "0.75rem" }}>
                      {r.material || "—"}
                    </Box>
                  )}
                  <Box component="td" sx={{ px: 2, py: 1.5, textAlign: "right", fontWeight: "bold", color: "grey.900" }}>
                    ₦{(r.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, textAlign: "right", fontWeight: "bold", color: (r.balance ?? 0) > 0 ? "error.main" : "success.main" }}>
                    ₦{(r.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Box>
                </tr>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Financial Summary */}
        <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 6 }}>
          <Stack sx={{ width: 320, gap: 2 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", fontSize: "0.875rem" }}>
              <Typography sx={{ color: "grey.500", fontWeight: 500 }}>Grand Total</Typography>
              <Typography sx={{ fontWeight: "bold", color: "grey.900" }}>
                ₦{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between", fontSize: "0.875rem" }}>
              <Typography sx={{ color: "grey.500", fontWeight: 500 }}>Amount Paid</Typography>
              <Typography sx={{ fontWeight: "bold", color: "success.main" }}>
                ₦{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between", fontSize: "1rem", pt: 1.5, borderTop: "2px solid", borderColor: "grey.900" }}>
              <Typography sx={{ fontWeight: 900, color: "grey.900" }}>Balance Due</Typography>
              <Typography sx={{ fontWeight: 900, color: totalBalance > 0 ? "error.main" : "grey.900" }}>
                ₦{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </Stack>
          </Stack>
        </Stack>

        {/* Payment Details */}
        <Box sx={{ mb: 4, bgcolor: "grey.50", borderRadius: 3, p: 2.5, border: "1px solid", borderColor: "grey.100" }}>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: "bold", color: "grey.400", textTransform: "uppercase", letterSpacing: "0.1em", mb: 1.5 }}>
            Payment Details
          </Typography>
          <Stack sx={{ gap: 0.75 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", fontSize: "0.875rem" }}>
              <Typography sx={{ color: "grey.500" }}>Account Name</Typography>
              <Typography sx={{ fontWeight: "bold", color: "grey.900" }}>Broad Options Media / Fasugba Elijah Niyi</Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between", fontSize: "0.875rem" }}>
              <Typography sx={{ color: "grey.500" }}>Account Number</Typography>
              <Typography sx={{ fontWeight: 900, color: "grey.900", letterSpacing: "0.1em" }}>5236650819</Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between", fontSize: "0.875rem" }}>
              <Typography sx={{ color: "grey.500" }}>Bank</Typography>
              <Typography sx={{ fontWeight: "bold", color: "grey.900" }}>Moniepoint MFB</Typography>
            </Stack>
          </Stack>
        </Box>

        {/* Footer */}
        <Box sx={{ borderTop: "1px solid", borderColor: "grey.200", pt: 3, textAlign: "center" }}>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: "bold", color: "grey.800", mb: 0.5 }}>
            Thank you for your business!
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "grey.500" }}>
            For inquiries, please contact us.
          </Typography>
        </Box>
      </Box>
    );
  }
);

ReceiptTemplate.displayName = "ReceiptTemplate";

