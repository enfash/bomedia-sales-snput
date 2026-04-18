"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LayoutDashboard, LogIn, Store } from "lucide-react";
import Link from "next/link";

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
        toast.success("Welcome back!");
        router.push("/bom03");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Invalid credentials");
      }
    } catch (err) {
      toast.error("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8 relative z-10">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-600 p-3 rounded-2xl">
            <LayoutDashboard className="w-8 h-8 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-black text-center text-gray-900 mb-2">Admin Portal</h1>
        <p className="text-sm text-center text-gray-500 mb-8 font-medium">
          Sign in to access secure financial records.
        </p>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-700 font-bold">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@bomedia.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 bg-gray-50 border-gray-100 focus:bg-white transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-700 font-bold">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 bg-gray-50 border-gray-100 focus:bg-white transition-colors"
            />
          </div>
          
          <Button
            type="submit"
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-heavy rounded-xl text-base shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
            disabled={loading}
          >
            {loading ? "Verifying..." : (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </>
            )}
          </Button>
        </form>

        <div className="mt-10">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase cursor-default">
              <span className="bg-white px-2 text-gray-400 font-black tracking-widest">or continued access</span>
            </div>
          </div>

          <div className="mt-6">
            <Link href="/cashier" tabIndex={-1}>
              <Button
                variant="outline"
                className="w-full h-12 bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200 font-bold rounded-xl"
                type="button"
              >
                <Store className="w-4 h-4 mr-2" />
                Continue as Cashier
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
