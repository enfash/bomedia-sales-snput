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
import { Label } from "@/components/ui/label";
import { usePathname } from "next/navigation";

type Cashier = {
  Name: string;
  Status: string;
};

export function NamePrompt({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [isLoadingCashiers, setIsLoadingCashiers] = useState(false);
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

  // Fetch cashiers when the dialog opens so the dropdown is populated
  useEffect(() => {
    if (!open) return;
    setIsLoadingCashiers(true);
    fetch("/api/cashiers")
      .then((r) => r.json())
      .then(({ data }) => setCashiers((data as Cashier[]) || []))
      .catch(() => setError("Could not load cashier list. Check your connection."))
      .finally(() => setIsLoadingCashiers(false));
  }, [open]);

  const handleSave = async () => {
    if (!selectedName) {
      setError("Please select your name from the list.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const cashier = cashiers.find((c) => c.Name === selectedName);

      if (!cashier) {
        setError("Name not found. Refresh and try again.");
        setIsSaving(false);
        return;
      }

      if (cashier.Status === "Online") {
        setError(`"${cashier.Name}" is currently logged in elsewhere.`);
        setIsSaving(false);
        return;
      }

      const res = await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cashier.Name, status: "Online" }),
      });

      if (res.ok) {
        localStorage.setItem("userName", cashier.Name);
        setOpen(false);
        setError("");
      } else {
        const resData = await res.json();
        setError(resData.error || "Failed to log in");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (pathname === "/bom03/login" || pathname === "/") return null;

  // Partition into available (Offline) and busy (Online) so busy names are
  // visible but disabled — cashier can see the full team at a glance.
  const availableCashiers = cashiers.filter((c) => c.Status !== "Online");
  const busyCashiers = cashiers.filter((c) => c.Status === "Online");

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
              Select your name from the list to continue to the cashier portal.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cashier-select">Select Your Name</Label>

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
                  {availableCashiers.length > 0 && (
                    <>
                      {availableCashiers.map((c) => (
                        <SelectItem key={c.Name} value={c.Name} className="font-semibold">
                          {c.Name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {busyCashiers.length > 0 && (
                    <>
                      {busyCashiers.map((c) => (
                        <SelectItem
                          key={c.Name}
                          value={c.Name}
                          disabled
                          className="text-muted-foreground line-through font-medium"
                        >
                          {c.Name} — online
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {cashiers.length === 0 && !isLoadingCashiers && (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No cashiers found. Ask admin to add your name.
                    </div>
                  )}
                </SelectContent>
              </Select>

              {error && (
                <p className="text-xs text-red-500 font-medium mt-1">{error}</p>
              )}
            </div>

            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl"
              onClick={handleSave}
              disabled={!selectedName || isSaving || isLoadingCashiers}
            >
              {isSaving ? "Logging in..." : "Get Started"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
