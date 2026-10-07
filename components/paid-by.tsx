"use client";

// "Paid by": Cash, Transfer or POS. The books keep the three apart, so every
// screen that takes money asks it (approved on the New Sale canvas, 7 Oct).
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { normalizePaymentMethod, type PaymentMethod } from "@/lib/payment-methods";

export function PaidBy({ value, onChange }: { value: PaymentMethod | ""; onChange: (method: PaymentMethod | "") => void }) {
  return (
    <Box component="fieldset" sx={{ gridColumn: "1 / -1", m: 0, p: 1.5, border: "2px solid", borderColor: "primary.main", borderRadius: 3 }}>
      <Typography component="legend" sx={{ px: 0.75, fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "primary.main" }}>
        Paid by *
      </Typography>
      <ToggleButtonGroup exclusive fullWidth color="primary" value={value} aria-label="How the customer paid"
        onChange={(_, next) => onChange(normalizePaymentMethod(next) ?? "")}>
        <ToggleButton value="cash">Cash</ToggleButton>
        <ToggleButton value="transfer">Transfer</ToggleButton>
        <ToggleButton value="pos">POS</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
