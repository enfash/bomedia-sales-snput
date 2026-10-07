"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";

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
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2, position: "relative", overflow: "hidden" }}>
      <Box sx={{ position: "absolute", top: "-20%", left: "-10%", width: "50%", height: "50%", borderRadius: "50%", bgcolor: "rgba(200,71,46,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />
      <Box sx={{ position: "absolute", bottom: "-20%", right: "-10%", width: "50%", height: "50%", borderRadius: "50%", bgcolor: "rgba(59,130,246,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

      <Paper elevation={2} sx={{ width: "100%", maxWidth: 448, borderRadius: 4, p: 4, position: "relative", zIndex: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
          <Paper variant="outlined" sx={{ p: 1, borderRadius: 2.5, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
            <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={48} height={48} style={{ objectFit: "contain", display: "block" }} />
          </Paper>
        </Box>

        <Typography variant="h4" sx={{ fontWeight: 800, textAlign: "center", mb: 0.75 }}>Admin Portal</Typography>
        <Typography variant="body2" sx={{ textAlign: "center", color: "text.secondary", mb: 4 }}>
          Sign in to access secure financial records.
        </Typography>

        <Box component="form" onSubmit={handleLogin} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          <TextField
            fullWidth
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="admin@bomedia.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <TextField
            fullWidth
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} startIcon={loading ? undefined : <LogIn size={16} />} sx={{ height: 48, fontWeight: 800 }}>
            {loading ? "Verifying..." : "Sign In"}
          </Button>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Divider>
            <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.disabled", px: 1 }}>
              or continued access
            </Typography>
          </Divider>
        </Box>

        <Box sx={{ mt: 2.5 }}>
          <Button component={Link} href="/cashier" variant="outlined" fullWidth size="large" startIcon={<Store size={16} />} sx={{ height: 48, fontWeight: 700 }}>
            Continue as Cashier
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
