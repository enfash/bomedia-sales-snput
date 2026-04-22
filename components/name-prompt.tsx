"use client";

import { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";

type Cashier = {
  Name: string;
  Status: string;
};

export function NamePrompt({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
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
    
    // Check if the current user needs to log in
    if (storedName && (storedName.toLowerCase() === "elijah" || storedName.toLowerCase() === "admin") && !isAdmin) {
      localStorage.removeItem("userName");
      setOpen(true);
    } else if (!storedName) {
      setOpen(true);
    }
  }, [isAdmin]);

  const handleSave = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Please enter your name");
      return;
    }

    setIsSaving(true);
    setError("");
    
    try {
      // Fetch authorized cashiers on demand
      const fetchRes = await fetch("/api/cashiers");
      const { data } = await fetchRes.json();
      const currentCashiers: Cashier[] = data || [];

      const selectedCashier = currentCashiers.find(c => c.Name.toLowerCase() === cleanName.toLowerCase());
      
      if (!selectedCashier) {
        setError("Not an authorized cashier. Ask admin to add your name.");
        setIsSaving(false);
        return;
      }

      if (selectedCashier.Status === "Online") {
        setError(`"${selectedCashier.Name}" is currently logged in elsewhere.`);
        setIsSaving(false);
        return;
      }

      const res = await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedCashier.Name, status: "Online" }),
      });

      if (res.ok) {
        localStorage.setItem("userName", selectedCashier.Name);
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

  return (
    <Fragment>
      {open && <div className="fixed inset-0 z-[150] bg-background" />}
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">👋 Welcome to BOMedia</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Enter your assigned name to continue to the cashier portal.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-name">Your Name</Label>
            
            <Input
              id="user-name"
              placeholder="e.g. John or Sarah"
              value={name}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              className={error ? "border-red-500 focus-visible:ring-red-500" : ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              disabled={isSaving}
            />
            
            {error && <p className="text-xs text-red-500 font-medium mt-1">{error}</p>}
          </div>
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            onClick={handleSave}
            disabled={!name || isSaving}
          >
            {isSaving ? "Logging in..." : "Get Started"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </Fragment>
  );
}
