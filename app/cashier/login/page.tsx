"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, ChevronLeft, ArrowRight, Delete, AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";

type Cashier = {
  Name: string;
  Status: string;
  HasPasscode: boolean;
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
    if (pin.length === 4 && step === "pin") handleSubmitPin();
  }, [pin, step]);

  const keypadBtnSx = {
    width: 64, height: 64, borderRadius: "50%", justifySelf: "center",
    bgcolor: "background.paper", border: "1px solid", borderColor: "divider",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "1.25rem", fontWeight: 800, color: "text.primary",
    cursor: "pointer", transition: "all 0.15s",
    "&:hover": { bgcolor: "rgba(247,104,8,0.06)", borderColor: "primary.light", transform: "scale(1.05)" },
    "&:active": { transform: "scale(0.9)" },
    "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
  };

  return (
    <Box sx={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      bgcolor: "background.default",
      p: 2, position: "relative", overflow: "hidden",
    }}>
      <Box sx={{ position: "absolute", top: "-20%", left: "-10%", width: "60%", height: "60%", borderRadius: "50%", bgcolor: "rgba(247,104,8,0.12)", filter: "blur(80px)", pointerEvents: "none" }} />
      <Box sx={{ position: "absolute", bottom: "-20%", right: "-10%", width: "60%", height: "60%", borderRadius: "50%", bgcolor: "rgba(253,224,71,0.1)", filter: "blur(80px)", pointerEvents: "none" }} />

      <Paper
        elevation={0}
        sx={{
          width: "100%", maxWidth: 448, borderRadius: "16px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.12)",
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          p: 4, position: "relative", zIndex: 1,
        }}
      >
        {/* Header */}
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 3 }}>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: "10px", mb: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", transition: "transform 0.3s", "&:hover": { transform: "scale(1.05)" } }}>
            <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={56} height={56} style={{ objectFit: "contain", display: "block" }} />
          </Paper>
          <Typography variant="h4" sx={{ fontWeight: 800, textAlign: "center", letterSpacing: "-0.02em", lineHeight: 1 }}>
            BOMedia Cashier Portal
          </Typography>
          <Typography variant="caption" sx={{ textAlign: "center", color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", mt: 1 }}>
            Secure Shift Access
          </Typography>
        </Box>

        {/* Step 1: Select cashier */}
        {step === "select" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", display: "block", mb: 1 }}>
                Who is signing in?
              </Typography>
              <FormControl fullWidth>
                <Select
                  value={selectedCashier?.Name || ""}
                  onChange={e => {
                    const found = cashiers.find(c => c.Name === e.target.value);
                    if (found) setSelectedCashier(found);
                  }}
                  disabled={loadingCashiers}
                  displayEmpty
                  sx={{ height: 56, borderRadius: "10px", fontWeight: 700 }}
                >
                  <MenuItem value="" disabled>
                    <Typography sx={{ color: "text.disabled" }}>
                      {loadingCashiers ? "Loading cashiers list..." : "Choose your name..."}
                    </Typography>
                  </MenuItem>
                  {cashiers.map(c => (
                    <MenuItem key={c.Name} value={c.Name} sx={{ fontWeight: 700, py: 1.5 }}>{c.Name}</MenuItem>
                  ))}
                  {cashiers.length === 0 && !loadingCashiers && (
                    <MenuItem disabled><Typography variant="body2" sx={{ color: "text.disabled", py: 1 }}>No cashiers registered.</Typography></MenuItem>
                  )}
                </Select>
              </FormControl>
            </Box>

            {selectedCashier && !selectedCashier.HasPasscode && (
              <Box sx={{ display: "flex", gap: 1, p: 1.5, borderRadius: "10px", bgcolor: "rgba(247,104,8,0.08)", border: "1px solid rgba(247,104,8,0.2)" }}>
                <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <Typography variant="caption" sx={{ color: "primary.dark", lineHeight: 1.5 }}>
                  No PIN is configured for your name. You can sign in instantly. Please ask your administrator to set up a 4-digit PIN.
                </Typography>
              </Box>
            )}

            <Button
              onClick={handleSelectNext}
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              disabled={!selectedCashier || submitting}
              endIcon={selectedCashier?.HasPasscode ? <ArrowRight size={18} /> : <LogIn size={18} />}
              sx={{ height: 56, fontWeight: 800, fontSize: "1rem", borderRadius: "10px"}}
            >
              {selectedCashier?.HasPasscode ? "Enter PIN Code" : submitting ? "Signing in..." : "Get Started Now"}
            </Button>
          </Box>
        )}

        {/* Step 2: PIN entry */}
        {step === "pin" && selectedCashier && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box
              component="button"
              onClick={() => { setStep("select"); setPin(""); }}
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", bgcolor: "transparent", border: "none", cursor: "pointer", "&:hover": { color: "primary.main" }, transition: "color 0.15s", p: 0 }}
            >
              <ChevronLeft size={16} />
              Not {selectedCashier.Name}?
            </Box>

            <Box sx={{ textAlign: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary" }}>
                Hi <Box component="span" sx={{ color: "primary.main", fontWeight: 800 }}>{selectedCashier.Name}</Box>,
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
                Enter your 4-digit PIN code to secure your shift
              </Typography>
            </Box>

            {/* PIN dot indicators */}
            <Box sx={{ display: "flex", justifyContent: "center", gap: 2.5, my: 0.5 }}>
              {[0, 1, 2, 3].map(idx => (
                <Box key={idx} sx={{
                  width: 20, height: 20, borderRadius: "50%", border: "2px solid",
                  transition: "all 0.15s",
                  transform: idx < pin.length ? "scale(1.1)" : "scale(1)",
                  bgcolor: idx < pin.length ? "primary.main" : "transparent",
                  borderColor: idx < pin.length ? "primary.main" : "divider",
                  boxShadow: idx < pin.length ? "0 2px 8px rgba(247,104,8,0.3)" : "none",
                }} />
              ))}
            </Box>

            {/* Numeric keypad */}
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, maxWidth: 280, mx: "auto", pt: 0.5 }}>
              {["1","2","3","4","5","6","7","8","9"].map(num => (
                <Box key={num} component="button" type="button" onClick={() => handleKeyPress(num)} disabled={submitting} sx={{ ...keypadBtnSx, justifySelf: "center" }}>
                  {num}
                </Box>
              ))}
              {/* Backspace */}
              <Box component="button" type="button" onClick={handleDelete} disabled={submitting} aria-label="Delete last digit"
                sx={{ width: 64, height: 64, borderRadius: "50%", justifySelf: "center", bgcolor: "grey.100", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "text.secondary", transition: "all 0.15s", "&:hover": { bgcolor: "rgba(192,57,43,0.08)", color: "error.main" }, "&:active": { transform: "scale(0.9)" } }}>
                <Delete size={20} />
              </Box>
              {/* Zero */}
              <Box component="button" type="button" onClick={() => handleKeyPress("0")} disabled={submitting} sx={{ ...keypadBtnSx, justifySelf: "center" }}>0</Box>
              {/* Spinner */}
              <Box sx={{ width: 64, height: 64, justifySelf: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {submitting && <Box sx={{ width: 24, height: 24, border: "3px solid", borderColor: "primary.main", borderTopColor: "transparent", borderRadius: "50%" }} className="animate-spin" />}
              </Box>
            </Box>
          </Box>
        )}

        {/* Footer */}
        <Box sx={{ mt: 4, pt: 3, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between" }}>
          <Box component={Link} href="/bom03/login" sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", textDecoration: "none", "&:hover": { color: "primary.main" }, transition: "color 0.15s" }}>
            Owner / Admin Login
          </Box>
          <Box component={Link} href="/" sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", textDecoration: "none", "&:hover": { color: "primary.main" }, transition: "color 0.15s" }}>
            Main Site
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
