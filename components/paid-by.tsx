"use client";

// Payment method: Cash, Transfer or POS. The books keep the three apart, so every
// screen that takes money asks it (approved on the New Sale canvas, 7 Oct).
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { paidByStyles as styles } from "@/app/theme";
import { normalizePaymentMethod, PAYMENT_METHODS, type PaymentMethod } from "@/lib/payment-methods";

export function PaidBy({ value, onChange, required = true, disabled = false, methods = PAYMENT_METHODS, helperText }: {
  value: PaymentMethod | "";
  onChange: (method: PaymentMethod | "") => void;
  required?: boolean;
  helperText?: string;
  disabled?: boolean;
  methods?: ReadonlyArray<{ value: PaymentMethod; label: string }>;
}) {
  return (
    <Box component="fieldset" sx={[styles.box, !!value && styles.boxChosen]}>
      <Typography component="legend" sx={[styles.legend, !!value && styles.legendChosen]}>
        Payment method{required ? " *" : ""}
      </Typography>
      <ToggleButtonGroup exclusive fullWidth color="primary" value={value} disabled={disabled} aria-label="Payment method"
        onChange={(_, next) => onChange(normalizePaymentMethod(next) ?? "")}>
        {methods.map(method => <ToggleButton key={method.value} value={method.value}>{method.label}</ToggleButton>)}
      </ToggleButtonGroup>
      {!required && <Typography variant="caption" color="text.secondary" sx={styles.helper}>
        {helperText||'Choose a method when receiving money. Leave blank if nothing is paid.'}
      </Typography>}
    </Box>
  );
}
