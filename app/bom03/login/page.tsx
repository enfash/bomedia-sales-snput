"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Box, Button, Divider, Paper, TextField, Typography } from "@mui/material";

import { loginStyles as styles } from "@/app/theme";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        localStorage.removeItem("bomedia-payment-context-v1");
        localStorage.setItem("userName", "Admin");
        toast.success("Welcome back!");
        router.push("/bom03");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Invalid credentials");
      }
    } catch {
      toast.error("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={styles.page}>
      <Paper variant="outlined" sx={styles.card}>
        <Box sx={styles.brand}>
          <Paper variant="outlined" sx={styles.logo}>
            <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={48} height={48} style={{ objectFit: "contain", display: "block" }} />
          </Paper>
          <Typography variant="h4" component="h1">Admin Portal</Typography>
          <Typography color="text.secondary">Sign in with your owner email and password.</Typography>
        </Box>

        <Box component="form" onSubmit={handleLogin} sx={styles.form}>
          <TextField fullWidth id="email" label="Email" type="email" autoComplete="email" placeholder="admin@bomedia.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField fullWidth id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} startIcon={loading ? undefined : <LogIn size={16} />}>
            {loading ? "Checking…" : "Sign in"}
          </Button>
        </Box>

        <Divider><Typography variant="body2" color="text.secondary">or</Typography></Divider>

        <Button component={Link} href="/cashier/login" variant="outlined" color="inherit" fullWidth size="large" startIcon={<Store size={16} />}>
          Sign in as a cashier
        </Button>
      </Paper>
    </Box>
  );
}
