"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NamePrompt() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (!storedName) {
      setOpen(true);
    }
  }, []);

  const handleSave = () => {
    if (name.trim()) {
      localStorage.setItem("userName", name.trim());
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl">👋 Welcome to BOMedia</DialogTitle>
          <DialogDescription>
            Enter your name below. It will be saved as the <strong>"Logged By"</strong> field on every entry you make.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="user-name">Your Name</Label>
            <Input
              id="user-name"
              placeholder="e.g. Elijah or Admin"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
