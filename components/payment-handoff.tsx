"use client";

// Once Postgres is in charge, payments are recorded in Accounting entry, where
// staff choose Cash, Transfer or POS and the debt is applied oldest first.
// The old payment boxes hand off there with the customer already chosen.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { paymentHref } from "@/lib/moved-pages";
export { customerIdOf } from "@/lib/moved-pages";

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
