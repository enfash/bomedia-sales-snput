"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, User, Store, LogIn, ChevronLeft, ArrowRight, Delete, AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

  // Fetch cashiers list on load
  useEffect(() => {
    fetch("/api/cashiers")
      .then((res) => res.json())
      .then((data) => {
        setCashiers(data.data || []);
      })
      .catch(() => {
        toast.error("Failed to load cashier list");
      })
      .finally(() => {
        setLoadingCashiers(false);
      });
  }, []);

  const handleSelectNext = () => {
    if (!selectedCashier) {
      toast.error("Please select your name first");
      return;
    }
    
    if (selectedCashier.HasPasscode) {
      setStep("pin");
    } else {
      // If no PIN is configured, login immediately
      handleLoginDirect();
    }
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

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
        
        // Heartbeat to mark active
        await fetch("/api/cashiers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: selectedCashier.Name, status: "Online" }),
        }).catch(() => {});

        window.location.href = "/cashier";
        return; // Prevents the finally block from clearing the loading state which can cancel navigation
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
    if (pin.length !== 4) {
      toast.error("Please enter a 4-digit PIN");
      return;
    }
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

        // Update cashier status to Online
        await fetch("/api/cashiers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: selectedCashier.Name, status: "Online" }),
        }).catch(() => {});

        window.location.href = "/cashier";
        return; // Prevents finally block
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Incorrect PIN");
        setPin(""); // Clear PIN on failure
      }
    } catch {
      toast.error("Failed to authenticate PIN");
      setPin("");
    }
    setSubmitting(false);
  };

  // Triggers submission automatically when PIN reaches 4 digits
  useEffect(() => {
    if (pin.length === 4 && step === "pin") {
      handleSubmitPin();
    }
  }, [pin, step]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4 relative overflow-hidden">
      {/* Visual background lights */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-300/20 dark:bg-orange-950/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-yellow-300/20 dark:bg-yellow-950/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/40 dark:border-zinc-800/40 p-8 relative z-10 transition-all duration-300">
        
        {/* Header Section */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white dark:bg-zinc-800 p-3 rounded-2xl shadow-md border border-orange-100 dark:border-zinc-700/50 mb-4 transition-transform hover:scale-105 duration-300">
            <Image
              src="/bomedia-icon.svg"
              alt="BOMedia Logo"
              width={56}
              height={56}
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-black text-center text-gray-900 dark:text-white tracking-tight leading-none">
            BOMedia Cashier Portal
          </h1>
          <p className="text-xs text-center text-gray-400 dark:text-zinc-500 font-bold uppercase tracking-wider mt-2">
            Secure Shift Access
          </p>
        </div>

        {/* STEP 1: SELECT CASHIER NAME */}
        {step === "select" && (
          <div className="space-y-6 animate-in fade-in-50 duration-300">
            <div className="space-y-2">
              <label htmlFor="cashier-select" className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 block pl-1">
                Who is signing in?
              </label>
              
              <Select
                value={selectedCashier?.Name || ""}
                onValueChange={(val) => {
                  const found = cashiers.find((c) => c.Name === val);
                  if (found) setSelectedCashier(found);
                }}
                disabled={loadingCashiers}
              >
                <SelectTrigger
                  id="cashier-select"
                  className="h-14 rounded-2xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-bold text-gray-800 dark:text-zinc-100 focus:ring-orange-500 focus:border-orange-500 shadow-sm transition-colors text-base"
                >
                  <SelectValue
                    placeholder={
                      loadingCashiers ? "Loading cashiers list..." : "Choose your name..."
                    }
                  />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-gray-100 dark:border-zinc-800 shadow-xl">
                  {cashiers.map((c) => (
                    <SelectItem
                      key={c.Name}
                      value={c.Name}
                      className="font-bold py-3 text-base"
                    >
                      {c.Name}
                    </SelectItem>
                  ))}
                  {cashiers.length === 0 && !loadingCashiers && (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">
                      No cashiers registered.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedCashier && !selectedCashier.HasPasscode && (
              <div className="flex gap-2 p-3 bg-amber-500/10 dark:bg-amber-500/5 rounded-2xl border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold leading-relaxed">
                  No PIN is configured for your name. You can sign in instantly. Please ask your administrator to set up a 4-digit PIN for your account.
                </p>
              </div>
            )}

            <Button
              onClick={handleSelectNext}
              className="w-full h-14 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-heavy rounded-2xl text-base shadow-lg shadow-orange-500/25 active:scale-[0.97] transition-all"
              disabled={!selectedCashier || submitting}
            >
              {selectedCashier?.HasPasscode ? (
                <>
                  Enter PIN Code
                  <ArrowRight className="w-5 h-5 ml-2 shrink-0" />
                </>
              ) : (
                <>
                  {submitting ? "Signing in..." : "Get Started Now"}
                  <LogIn className="w-5 h-5 ml-2 shrink-0" />
                </>
              )}
            </Button>
          </div>
        )}

        {/* STEP 2: ENTER 4-DIGIT PIN */}
        {step === "pin" && selectedCashier && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            
            {/* Back to Name Select */}
            <button
              onClick={() => {
                setStep("select");
                setPin("");
              }}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-orange-500 dark:text-zinc-500 dark:hover:text-orange-400 font-black uppercase tracking-widest transition-colors pl-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Not {selectedCashier.Name}?
            </button>

            <div className="text-center">
              <p className="text-sm font-bold text-gray-600 dark:text-zinc-300">
                Hi <span className="text-orange-500 font-black">{selectedCashier.Name}</span>,
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                Enter your 4-digit PIN code to secure your shift
              </p>
            </div>

            {/* PIN Dot Indicators */}
            <div className="flex justify-center gap-5 my-4">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 transition-all duration-150 scale-100",
                    idx < pin.length
                      ? "bg-orange-500 border-orange-500 shadow-md shadow-orange-500/20 scale-110"
                      : "bg-transparent border-gray-300 dark:border-zinc-700"
                  )}
                />
              ))}
            </div>

            {/* Premium Virtual Keyboard (Sleek Numeric Keypad) */}
            <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto pt-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeyPress(num)}
                  disabled={submitting}
                  className="w-16 h-16 rounded-full bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700/50 shadow-sm flex items-center justify-center text-xl font-black text-gray-800 dark:text-zinc-200 transition-all hover:bg-orange-50 hover:border-orange-200 dark:hover:bg-zinc-700 hover:scale-105 active:scale-90"
                >
                  {num}
                </button>
              ))}
              
              {/* Backspace Button */}
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="w-16 h-16 rounded-full bg-gray-50 dark:bg-zinc-800/40 hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500 flex items-center justify-center transition-all active:scale-90"
                aria-label="Delete last digit"
              >
                <Delete className="w-5 h-5" />
              </button>

              {/* Zero Button */}
              <button
                type="button"
                onClick={() => handleKeyPress("0")}
                disabled={submitting}
                className="w-16 h-16 rounded-full bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700/50 shadow-sm flex items-center justify-center text-xl font-black text-gray-800 dark:text-zinc-200 transition-all hover:bg-orange-50 hover:border-orange-200 dark:hover:bg-zinc-700 hover:scale-105 active:scale-90"
              >
                0
              </button>

              {/* Login Submit Indicator / Spinner */}
              <div className="w-16 h-16 flex items-center justify-center">
                {submitting && (
                  <div className="w-6 h-6 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer Links */}
        <div className="mt-8 border-t border-gray-100 dark:border-zinc-800/60 pt-6 flex justify-between items-center text-xs">
          <Link
            href="/bom03/login"
            className="text-gray-400 dark:text-zinc-500 hover:text-orange-500 dark:hover:text-orange-400 font-bold transition-colors"
          >
            Owner / Admin Login
          </Link>
          <Link
            href="/"
            className="text-gray-400 dark:text-zinc-500 hover:text-orange-500 dark:hover:text-orange-400 font-bold transition-colors"
          >
            Main Site
          </Link>
        </div>

      </div>
    </div>
  );
}
