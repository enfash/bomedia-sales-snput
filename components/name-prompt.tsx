"use client";

import { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePathname } from "next/navigation";

type Cashier = {
  Name: string;
  Status: string;
};

export function NamePrompt({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [manualName, setManualName] = useState("");
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [isLoadingCashiers, setIsLoadingCashiers] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (isAdmin) {
      localStorage.setItem("userName", "Elijah");
      setOpen(false);
      return;
    }

    const storedName = localStorage.getItem("userName");

    if (storedName && (storedName.toLowerCase() === "elijah" || storedName.toLowerCase() === "admin") && !isAdmin) {
      localStorage.removeItem("userName");
      setOpen(true);
    } else if (!storedName) {
      setOpen(true);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!open) return;
    setIsLoadingCashiers(true);
    setApiFailed(false);
    fetch("/api/cashiers")
      .then((r) => r.json())
      .then(({ data }) => {
        const list = (data as Cashier[]) || [];
        setCashiers(list);
        if (list.length === 0) setApiFailed(true);
      })
      .catch(() => {
        setApiFailed(true);
        setError("");
      })
      .finally(() => setIsLoadingCashiers(false));
  }, [open]);

  const handleSave = async () => {
    const nameToUse = apiFailed ? manualName.trim() : selectedName;

    if (!nameToUse) {
      setError(apiFailed ? "Please enter your name." : "Please select your name from the list.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      // Try to update status — but don't block login if it fails
      await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameToUse, status: "Online" }),
      }).catch(() => {/* non-blocking */});

      localStorage.setItem("userName", nameToUse);
      setOpen(false);
      setError("");
    } catch {
      // Even if the PATCH fails, let them in
      localStorage.setItem("userName", nameToUse);
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (pathname === "/bom03/login" || pathname === "/") return null;

  const activeName = apiFailed ? manualName.trim() : selectedName;

  return (
    <Fragment>
      {open && <div className="fixed inset-0 z-[150] bg-background" />}
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">
              👋 Welcome to BOMedia
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {apiFailed
                ? "Type your name to continue to the cashier portal."
                : "Select your name from the list to continue to the cashier portal."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cashier-select">
                {apiFailed ? "Your Name" : "Select Your Name"}
              </Label>

              {apiFailed ? (
                <Input
                  id="cashier-select"
                  placeholder="Type your name…"
                  value={manualName}
                  onChange={(e) => {
                    setManualName(e.target.value);
                    setError("");
                  }}
                  className="h-12 rounded-xl font-semibold"
                  autoFocus
                />
              ) : (
                <Select
                  value={selectedName}
                  onValueChange={(val) => {
                    setSelectedName(val);
                    setError("");
                  }}
                  disabled={isLoadingCashiers || isSaving}
                >
                  <SelectTrigger
                    id="cashier-select"
                    className={`h-12 rounded-xl font-semibold ${error ? "border-red-500 focus:ring-red-500" : ""}`}
                  >
                    <SelectValue
                      placeholder={
                        isLoadingCashiers ? "Loading cashiers..." : "Choose your name"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {cashiers.map((c) => (
                      <SelectItem
                        key={c.Name}
                        value={c.Name}
                        className="font-semibold"
                      >
                        {c.Name}
                        {c.Status === "Online" && (
                          <span className="ml-2 text-[10px] text-amber-500 font-bold">● active</span>
                        )}
                      </SelectItem>
                    ))}
                    {cashiers.length === 0 && !isLoadingCashiers && (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No cashiers found. Ask admin to add your name.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}

              {!apiFailed && (
                <button
                  type="button"
                  onClick={() => { setApiFailed(true); setError(""); }}
                  className="text-[11px] text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
                >
                  My name isn't in the list
                </button>
              )}

              {error && (
                <p className="text-xs text-red-500 font-medium mt-1">{error}</p>
              )}
            </div>

            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl"
              onClick={handleSave}
              disabled={!activeName || isSaving || isLoadingCashiers}
            >
              {isSaving ? "Logging in..." : "Get Started"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
