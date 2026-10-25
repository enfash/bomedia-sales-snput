"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Box, Button, Paper, TextField, Typography } from "@mui/material";

import { loginStyles as styles } from "@/app/theme";

// The emailed reset link brings a temporary token in the part of the address after "#". It never goes to the server in the address;
// we read it here, clear it from the address bar, and send it only with the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const found = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access_token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    Promise.resolve().then(() => setToken(found));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== again) return void toast.error("The two passwords are not the same.");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return void toast.error(data.error || "Could not change the password.");
      toast.success("Password changed. Sign in with the new one.");
      router.push("/bom03/login");
    } catch { toast.error("Failed to connect to server"); } finally { setLoading(false); }
  };

  return (
    <Box sx={styles.page}>
      <Paper variant="outlined" sx={styles.card}>
        <Box sx={styles.brand}>
          <Typography variant="h4" component="h1">Choose a new password</Typography>
          <Typography color="text.secondary">{token ? "Use at least 12 characters." : "This reset link is missing or already used. Ask for a new one from the sign-in page."}</Typography>
        </Box>
        {token && (
          <Box component="form" onSubmit={submit} sx={styles.form}>
            <TextField fullWidth label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <TextField fullWidth label="Type it again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading}>{loading ? "Saving…" : "Change password"}</Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
