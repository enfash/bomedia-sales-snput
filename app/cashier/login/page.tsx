"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, ChevronLeft, ArrowRight, Delete, AlertCircle, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Box, Button, MenuItem, Paper, TextField, Typography } from "@mui/material";

import { loginStyles as styles } from "@/app/theme";

type Cashier = {
  Name: string;
  Status: string;
  HasPasscode: boolean;
  RequiresPinReset?: boolean;
};

export default function CashierLoginPage() {
  const router = useRouter();
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedCashier, setSelectedCashier] = useState<Cashier | null>(null);
  const [pin, setPin] = useState("");
  const [loadingCashiers, setLoadingCashiers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"select" | "pin">("select");

  useEffect(() => {
    fetch("/api/cashiers")
      .then(res => res.json())
      .then(data => { setCashiers(data.data || []); })
      .catch(() => { toast.error("Failed to load cashier list"); })
      .finally(() => { setLoadingCashiers(false); });
  }, []);

  const handleSelectNext = () => {
    if (!selectedCashier) { toast.error("Please select your name first"); return; }
    if (selectedCashier.HasPasscode) { setStep("pin"); }
    else { handleLoginDirect(); }
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) setPin(prev => prev + num);
  };

  const handleDelete = () => setPin(prev => prev.slice(0, -1));

  const handleLoginDirect = async () => {
    if (!selectedCashier) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/cashier-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedCashier.Name, passcode: "" }),
      });
      if (res.ok) {
        localStorage.removeItem("bomedia-payment-context-v1");
        localStorage.setItem("userName", selectedCashier.Name);
        toast.success(`Welcome back, ${selectedCashier.Name}!`);
        await fetch("/api/cashiers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: selectedCashier.Name, status: "Online" }),
        }).catch(() => {});
        window.location.href = "/cashier";
        return;
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Login failed");
      }
    } catch {
      toast.error("Failed to connect to authentication server");
    }
    setSubmitting(false);
  };

  const handleSubmitPin = async () => {
    if (!selectedCashier) return;
    if (pin.length !== 4) { toast.error("Please enter a 4-digit PIN"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/cashier-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedCashier.Name, passcode: pin }),
      });
      if (res.ok) {
        localStorage.removeItem("bomedia-payment-context-v1");
        localStorage.setItem("userName", selectedCashier.Name);
        toast.success(`Welcome back, ${selectedCashier.Name}!`);
        await fetch("/api/cashiers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: selectedCashier.Name, status: "Online" }),
        }).catch(() => {});
        window.location.href = "/cashier";
        return;
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Incorrect PIN");
        setPin("");
      }
    } catch {
      toast.error("Failed to authenticate PIN");
      setPin("");
    }
    setSubmitting(false);
  };

  useEffect(() => {
    if (pin.length === 4 && step === "pin") void Promise.resolve().then(handleSubmitPin);
  }, [pin, step]);

  return (
    <Box sx={styles.page}>
      <Paper variant="outlined" sx={styles.card}>
        <Box sx={styles.brand}>
          <Paper variant="outlined" sx={styles.logo}>
            <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={48} height={48} style={{ objectFit: "contain", display: "block" }} />
          </Paper>
          <Typography variant="h4" component="h1">Cashier sign-in</Typography>
          <Typography color="text.secondary">Choose your name and enter your PIN.</Typography>
        </Box>

        {step === "select" && (
          <Box sx={styles.form}>
            <TextField select fullWidth label="Your name" value={selectedCashier?.Name || ""} disabled={loadingCashiers}
              onChange={(e) => { const found = cashiers.find((c) => c.Name === e.target.value); if (found) setSelectedCashier(found); }}
              helperText={loadingCashiers ? "Loading the list of cashiers…" : cashiers.length === 0 ? "No cashiers are registered yet." : undefined}>
              {cashiers.map((c) => <MenuItem key={c.Name} value={c.Name}>{c.Name}</MenuItem>)}
            </TextField>

            {selectedCashier && !selectedCashier.HasPasscode && (
              <Box sx={styles.notice}>
                <Box component="span" sx={styles.noticeIcon}><AlertCircle size={18} /></Box>
                <Typography variant="body2">
                  {selectedCashier.RequiresPinReset ? "Ask your administrator to set a 4-digit PIN before signing in." : "No PIN is set for your name, so you can sign in straight away. Please ask your administrator to set up a 4-digit PIN."}
                </Typography>
              </Box>
            )}

            <Button onClick={handleSelectNext} variant="contained" fullWidth size="large"
              disabled={!selectedCashier || submitting || selectedCashier.RequiresPinReset === true}
              endIcon={selectedCashier?.HasPasscode ? <ArrowRight size={18} /> : <LogIn size={18} />}>
              {selectedCashier?.HasPasscode ? "Enter your PIN" : submitting ? "Signing in…" : "Sign in"}
            </Button>
          </Box>
        )}

        {step === "pin" && selectedCashier && (
          <Box sx={styles.form}>
            <Button color="inherit" size="small" startIcon={<ChevronLeft size={16} />} sx={styles.back} onClick={() => { setStep("select"); setPin(""); }}>
              Not {selectedCashier.Name}?
            </Button>
            <Box sx={styles.greeting}>
              <Typography>Hi <Box component="span" sx={styles.greetingName}>{selectedCashier.Name}</Box>,</Typography>
              <Typography variant="body2" color="text.secondary">enter your 4-digit PIN.</Typography>
            </Box>
            <Box sx={styles.dots} role="status" aria-label={`${pin.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((idx) => <Box key={idx} component="span" sx={idx < pin.length ? styles.dotOn : styles.dot} />)}
            </Box>
            <Box sx={styles.keypad}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <Button key={num} variant="outlined" color="inherit" sx={styles.key} onClick={() => handleKeyPress(num)} disabled={submitting}>{num}</Button>
              ))}
              <Button variant="text" color="inherit" sx={styles.keyDelete} onClick={handleDelete} disabled={submitting} aria-label="Delete last digit"><Delete size={20} /></Button>
              <Button variant="outlined" color="inherit" sx={styles.key} onClick={() => handleKeyPress("0")} disabled={submitting}>0</Button>
              <Box sx={styles.keySpace}>{submitting && <Box component="span" sx={styles.spinner}><RefreshCw size={22} /></Box>}</Box>
            </Box>
          </Box>
        )}

        <Box sx={styles.footer}>
          <Box component={Link} href="/bom03/login" sx={styles.footerLink}>Owner sign-in</Box>
          <Box component={Link} href="/" sx={styles.footerLink}>Main site</Box>
        </Box>
      </Paper>
    </Box>
  );
}
