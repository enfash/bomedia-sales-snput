"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, ShieldCheck, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Box, Button, Divider, Paper, TextField, Typography } from "@mui/material";

import { loginStyles as styles } from "@/app/theme";

type Step = "password" | "setup" | "code" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(url: string, payload: Record<string, unknown>) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }
  async function run(work: () => Promise<void>) {
    setLoading(true);
    try { await work(); } catch { toast.error("Failed to connect to server"); } finally { setLoading(false); }
  }
  function enter() {
    localStorage.removeItem("bomedia-payment-context-v1");
    localStorage.setItem("userName", "Admin");
    toast.success("Welcome back!");
    router.push("/bom03");
    router.refresh();
  }

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { ok, data } = await send("/api/auth/login", { email, password });
      if (!ok) return void toast.error(data.error || "Invalid credentials");
      if (data.step === "setup") { setQr(data.qr); setSecret(data.secret); setStep("setup"); setPassword(""); return; }
      if (data.step === "code") { setStep("code"); setPassword(""); return; }
      enter(); // Password-only mode (no second step).
    });
  };
  const handleCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { ok, data } = await send("/api/auth/admin-code", { code });
      if (!ok) { toast.error(data.error || "That code is not right"); if (data.error?.includes("expired")) { setStep("password"); setCode(""); } return; }
      enter();
    });
  };
  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await send("/api/auth/admin-reset-request", { email });
      toast.success("If that is the owner email, a reset link is on its way.");
      setStep("password");
    });
  };

  const heading = { password: "Admin Portal", setup: "Set up your authenticator", code: "Enter your code", forgot: "Reset your password" }[step];
  const subtitle = {
    password: "Sign in with your owner email and password.",
    setup: "Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), then type the 6-digit code it shows.",
    code: "Open your authenticator app and type the 6-digit code for BOMedia.",
    forgot: "We will email a reset link to the owner address.",
  }[step];

  return (
    <Box sx={styles.page}>
      <Paper variant="outlined" sx={styles.card}>
        <Box sx={styles.brand}>
          <Paper variant="outlined" sx={styles.logo}>
            <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={48} height={48} style={{ objectFit: "contain", display: "block" }} />
          </Paper>
          <Typography variant="h4" component="h1">{heading}</Typography>
          <Typography color="text.secondary">{subtitle}</Typography>
        </Box>

        {step === "password" && (
          <Box component="form" onSubmit={handlePassword} sx={styles.form}>
            <TextField fullWidth id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField fullWidth id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} startIcon={loading ? undefined : <LogIn size={16} />}>
              {loading ? "Checking…" : "Sign in"}
            </Button>
            <Button variant="text" size="small" sx={styles.textLink} onClick={() => setStep("forgot")}>Forgot password?</Button>
          </Box>
        )}

        {(step === "setup" || step === "code") && (
          <Box component="form" onSubmit={handleCode} sx={styles.form}>
            {step === "setup" && (
              <>
                <Box component="img" src={qr} alt="Authenticator QR code" sx={styles.qr} />
                <Typography variant="body2" color="text.secondary" align="center">Cannot scan? Type this key into the app instead:</Typography>
                <Typography variant="body2" sx={styles.secret}>{secret}</Typography>
              </>
            )}
            <TextField fullWidth id="code" label="6-digit code" autoComplete="one-time-code" value={code} sx={styles.codeInput}
              slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6, pattern: "[0-9]{6}" } }}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading || code.length !== 6} startIcon={loading ? undefined : <ShieldCheck size={16} />}>
              {loading ? "Checking…" : step === "setup" ? "Confirm and sign in" : "Sign in"}
            </Button>
            <Button variant="text" size="small" sx={styles.textLink} onClick={() => { setStep("password"); setCode(""); }}>Back</Button>
          </Box>
        )}

        {step === "forgot" && (
          <Box component="form" onSubmit={handleForgot} sx={styles.form}>
            <TextField fullWidth id="reset-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button>
            <Button variant="text" size="small" sx={styles.textLink} onClick={() => setStep("password")}>Back</Button>
          </Box>
        )}

        <Divider><Typography variant="body2" color="text.secondary">or</Typography></Divider>

        <Button component={Link} href="/cashier/login" variant="outlined" color="inherit" fullWidth size="large" startIcon={<Store size={16} />}>
          Sign in as a cashier
        </Button>
      </Paper>
    </Box>
  );
}
