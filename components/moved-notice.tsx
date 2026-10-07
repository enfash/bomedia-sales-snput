"use client";

// Once Postgres is in charge, old forms that would only refuse to save show
// where the job is done now instead.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { movedHref, type MovedTarget } from "@/lib/moved-pages";

const COPY: Record<MovedTarget, { text: string; label: string }> = {
  stock: { text: "Rolls, waste and stock counts are recorded in Stock entry.", label: "Open Stock entry" },
  expenses: { text: "Expenses are recorded in Accounting entry.", label: "Record expense" },
};

export function MovedNotice({ target }: { target: MovedTarget }) {
  const pathname = usePathname();
  return (
    <Alert severity="info" action={<Button component={Link} href={movedHref(pathname, target)} variant="contained" size="small">{COPY[target].label}</Button>}>
      {COPY[target].text}
    </Alert>
  );
}

export function MovedButton({ target, children }: { target: MovedTarget; children: React.ReactNode }) {
  const pathname = usePathname();
  return <Button component={Link} href={movedHref(pathname, target)} variant="contained">{children}</Button>;
}

export function MovedDialog({ open, onClose, title, target }: { open: boolean; onClose: () => void; title: string; target: MovedTarget }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><MovedNotice target={target} /></DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
