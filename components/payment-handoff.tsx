"use client";

// Once Postgres is in charge, payments are recorded in Accounting entry, where
// staff choose Cash, Transfer or POS and the debt is applied oldest first.
// The old payment boxes hand off there with the customer already chosen.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

export function paymentHref(pathname: string | null, customerId?: string | null): string {
  const base = pathname?.startsWith("/bom03") ? "/bom03" : "/cashier";
  const params = new URLSearchParams({ tab: "payments" });
  if (customerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) params.set("customer", customerId);
  return `${base}/accounting?${params}`;
}

/** The one customer ID behind these rows, or null when none or several share the name. */
export function customerIdOf(rows: Record<string, unknown>[]): string | null {
  const ids = new Set(rows.map(r => r._customerId).filter((id): id is string => typeof id === "string" && id !== ""));
  return ids.size === 1 ? [...ids][0] : null;
}

export function PaymentHandoff({ customerId, owed }: { customerId?: string | null; owed?: number }) {
  const pathname = usePathname();
  return (
    <Alert severity="info" action={
      <Button component={Link} href={paymentHref(pathname, customerId)} variant="contained" size="small">Record payment</Button>
    }>
      {owed !== undefined && owed > 0 && <Typography sx={{ fontWeight: 700 }}>Owes ₦{owed.toLocaleString("en-NG")}</Typography>}
      <Typography variant="body2">Payments are recorded in Accounting entry, where you choose Cash, Transfer or POS.</Typography>
    </Alert>
  );
}
