"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSyncStore } from "@/lib/store";
import { Camera, Check, ChevronsUpDown, Loader2, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type RecentExpense = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  paymentMethod: string;
  paidTo: string;
};

const EXPENSE_CATEGORIES = [
  "Raw Materials",
  "SAV 3ft",
  "SAV 4ft",
  "SAV 5ft",
  "Flex 3ft",
  "Flex 4ft",
  "Flex 5ft",
  "Flex 6ft",
  "Flex 8ft",
  "Flex 10ft",
  "Ink",
  "Equipment",
  "Utilities",
  "Salaries",
  "Transport",
  "Maintenance",
  "Marketing",
  "Office Supplies",
  "Miscellaneous",
];

export function ExpenseEntry({ onSaved }: { onSaved?: () => void } = {}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);

  const [open, setOpen] = useState(false);
  const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "",
    description: "",
    paidTo: "",
    paymentMethod: "Cash",
    receiptUrl: "",
    status: "Unpaid" as "Paid" | "Unpaid",
  });

  const { cachedExpenses } = useSyncStore();

  const uniqueVendors = useMemo(() => {
    const names = new Set<string>();
    cachedExpenses.forEach((e: any) => {
      const n = (e["PAID TO"] || "").trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort();
  }, [cachedExpenses]);

  const filteredVendors = useMemo(() => {
    const q = formData.paidTo.toLowerCase();
    return uniqueVendors.filter(v => v.toLowerCase().includes(q)).slice(0, 6);
  }, [uniqueVendors, formData.paidTo]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Max 5MB.");
      return;
    }

    setIsUploading(true);
    const uploadToast = toast.loading("Uploading receipt...");

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      });

      if (!res.ok) throw new Error("Upload failed");

      const { url } = await res.json();
      setFormData((prev) => ({ ...prev, receiptUrl: url }));
      toast.success("Receipt uploaded successfully!", { id: uploadToast });
    } catch (err: any) {
      toast.error(
        "Failed to upload photo. You can try again or save without it.",
        { id: uploadToast },
      );
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReview = () => {
    if (!formData.amount || !formData.category || !formData.description) {
      toast.error("Please fill in Amount, Category, and Description.");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleSave = async () => {
    const loggedBy = localStorage.getItem("userName") || "Unknown";
    const payload = {
      DATE: formData.date,
      AMOUNT: formData.amount,
      CATEGORY: formData.category,
      DESCRIPTION: formData.description,
      "PAID TO": formData.paidTo,
      "PAYMENT METHOD": formData.paymentMethod,
      "RECEIPT URL": formData.receiptUrl,
      "Logged By": loggedBy,
      STATUS: formData.status,
      "PAID BY": formData.status === "Paid" ? loggedBy : "",
      "PAID AT": formData.status === "Paid" ? new Date().toISOString() : "",
    };

    try {
      useSyncStore.getState().addPendingEntry("expense", payload);

      // Capture the ID synchronously — addPendingEntry is a sync Zustand set
      const queue = useSyncStore.getState().pendingQueue;
      const entryId = queue[queue.length - 1]?.id ?? "";

      const saved: RecentExpense = {
        id: entryId,
        amount: formData.amount,
        category: formData.category,
        description: formData.description,
        date: formData.date,
        paymentMethod: formData.paymentMethod,
        paidTo: formData.paidTo,
      };
      setRecentExpenses(prev => [saved, ...prev].slice(0, 5));

      setShowConfirmModal(false);

      toast.success(`₦${Number(formData.amount).toLocaleString()} logged`, {
        description: `${formData.category} · ${formData.description}`,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            useSyncStore.getState().removeEntry(entryId);
            setRecentExpenses(prev => prev.filter(e => e.id !== entryId));
            toast.info("Expense removed.", { duration: 2000 });
          },
        },
      });
      onSaved?.();

      setFormData({
        date: new Date().toISOString().split("T")[0],
        amount: "",
        category: "",
        description: "",
        paidTo: "",
        paymentMethod: "Cash",
        receiptUrl: "",
        status: "Unpaid",
      });
    } catch (err) {
      toast.error("Error saving expense locally.");
    }
  };

  return (
    <>
      <div className="w-full max-w-2xl mx-auto p-2 md:p-4">
        <Card className="border-primary/20 dark:border-zinc-800 shadow-sm overflow-hidden dark:bg-zinc-900 transition-colors">
          <CardHeader className="bg-primary/5 dark:bg-zinc-800/50 border-b border-primary/20 dark:border-zinc-800 p-4">
            <CardTitle className="text-primary dark:text-primary-foreground/90 text-lg font-black">
              Expense Entry
            </CardTitle>
            <CardDescription className="text-xs dark:text-zinc-400 font-medium">
              Record expenditures to the Expenses sheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 px-4">
            <div className="space-y-1">
              <Label
                htmlFor="exp-date"
                className="text-[10px] uppercase font-black text-gray-800 dark:text-zinc-400"
              >
                Date
              </Label>
              <Input
                id="exp-date"
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="exp-amount"
                className="text-[10px] uppercase font-black text-gray-800 dark:text-zinc-400"
              >
                Amount (₦)
              </Label>
              <Input
                id="exp-amount"
                type="number"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 placeholder:text-gray-500 dark:placeholder:text-zinc-500 font-bold"
              />
            </div>
            <div className="space-y-1 flex flex-col">
              <Label
                htmlFor="exp-category"
                className="text-[10px] uppercase font-black text-gray-800 dark:text-zinc-400"
              >
                Category
              </Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="exp-category"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="justify-between rounded-xl border-primary/20 dark:border-zinc-800 font-bold h-10 px-3 bg-white dark:bg-zinc-950 hover:bg-white dark:hover:bg-zinc-900 transition-[background-color] text-sm"
                  >
                    <span
                      className={
                        formData.category
                          ? "text-gray-900 dark:text-zinc-100"
                          : "text-gray-500 dark:text-zinc-400"
                      }
                    >
                      {formData.category || "Select category..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--anchor-width)] p-0 dark:bg-zinc-950 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xl"
                  align="start"
                >
                  <Command className="dark:bg-zinc-950">
                    <CommandInput
                      placeholder="Search category..."
                      className="dark:text-zinc-100"
                    />
                    <CommandList>
                      <CommandEmpty>No category found.</CommandEmpty>
                      <CommandGroup>
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <CommandItem
                            key={cat}
                            value={cat}
                            onSelect={() => {
                              setFormData({ ...formData, category: cat });
                              setOpen(false);
                            }}
                            className="flex items-center justify-between font-bold dark:text-zinc-300 data-[selected=true]:bg-primary/10 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-white"
                          >
                            <span>{cat}</span>
                            <Check
                              className={cn(
                                "h-4 w-4 text-primary",
                                formData.category === cat
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="exp-method"
                className="text-[10px] uppercase font-black text-gray-800 dark:text-zinc-400"
              >
                Method
              </Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(val: string) =>
                  setFormData({ ...formData, paymentMethod: val })
                }
              >
                <SelectTrigger
                  id="exp-method"
                  className="rounded-xl border-primary/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 font-bold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-zinc-950 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                  <SelectItem
                    value="Cash"
                    className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-900 dark:focus:text-white"
                  >
                    Cash
                  </SelectItem>
                  <SelectItem
                    value="Bank Transfer"
                    className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-900 dark:focus:text-white"
                  >
                    Bank Transfer
                  </SelectItem>
                  <SelectItem
                    value="POS"
                    className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-900 dark:focus:text-white"
                  >
                    POS
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-black text-gray-800 dark:text-zinc-400">
                Payment Status
              </Label>
              <div className="flex items-center gap-2 h-10">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, status: "Unpaid" })}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-sm font-black border transition-colors",
                    formData.status === "Unpaid"
                      ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400"
                      : "bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 text-gray-400 dark:text-zinc-500"
                  )}
                >
                  Unpaid
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, status: "Paid" })}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-sm font-black border transition-colors",
                    formData.status === "Paid"
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                      : "bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 text-gray-400 dark:text-zinc-500"
                  )}
                >
                  Paid
                </button>
              </div>
            </div>

            <div className="space-y-1 relative">
              <Label
                htmlFor="exp-paidto"
                className="text-[10px] uppercase font-black text-gray-800 dark:text-zinc-400"
              >
                Paid To
              </Label>
              <Input
                id="exp-paidto"
                placeholder="Vendor/Person"
                value={formData.paidTo}
                onFocus={() => setShowVendorSuggestions(true)}
                onBlur={() => setTimeout(() => setShowVendorSuggestions(false), 180)}
                onChange={(e) => {
                  setFormData({ ...formData, paidTo: e.target.value });
                  setShowVendorSuggestions(true);
                }}
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 placeholder:text-gray-500 dark:placeholder:text-zinc-500 font-bold"
              />
              {showVendorSuggestions && filteredVendors.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
                  {filteredVendors.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="w-full px-4 py-3 text-sm font-bold text-left text-gray-700 dark:text-zinc-300 hover:bg-primary/5 dark:hover:bg-zinc-800 transition-colors border-b border-gray-50 dark:border-zinc-800 last:border-0"
                      onMouseDown={() => {
                        setFormData({ ...formData, paidTo: v });
                        setShowVendorSuggestions(false);
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label
                htmlFor="exp-desc"
                className="text-[10px] uppercase font-black text-gray-800 dark:text-zinc-400"
              >
                Description
              </Label>
              <Input
                id="exp-desc"
                placeholder="Reason for expense"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 font-bold"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label
                htmlFor="exp-photo"
                className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500"
              >
                Receipt Photo (Optional)
              </Label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    id="exp-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                    disabled={isUploading}
                  />
                  <div
                    className={cn(
                      "flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-3 transition-colors",
                       formData.receiptUrl
                        ? "bg-green-50 dark:bg-emerald-950/20 border-green-200 dark:border-emerald-900/30 text-green-800 dark:text-emerald-400"
                        : "bg-gray-50 dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-900",
                    )}
                  >
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : formData.receiptUrl ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                    <span className="text-sm font-medium">
                      {isUploading
                        ? "Uploading..."
                        : formData.receiptUrl
                          ? "Photo Attached"
                          : "Take Photo / Upload"}
                    </span>
                  </div>
                </div>
                {formData.receiptUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData({ ...formData, receiptUrl: "" })}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-4 border-t dark:border-white/5 bg-gray-50/50 dark:bg-zinc-900/50">
            <Button
              onClick={handleReview}
              className="w-full bg-primary hover:bg-primary/95 text-primary-foreground py-6 text-base font-bold rounded-xl shadow-lg shadow-primary/20 dark:shadow-none transition-[background-color,transform] active:scale-[0.97]"
            >
              Review & Save
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Recent Expenses — session only, cleared on page reload */}
      {recentExpenses.length > 0 && (
        <div className="w-full max-w-2xl mx-auto px-2 md:px-4 pb-8">
          <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
              <div className="flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">
                  This Session
                </span>
              </div>
              <span className="text-[10px] font-black text-gray-400 dark:text-zinc-500">
                {recentExpenses.length} logged
              </span>
            </div>
            <ul className="divide-y divide-gray-50 dark:divide-zinc-800">
              {recentExpenses.map((exp) => (
                <li key={exp.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                      {exp.category}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate mt-0.5">
                      {exp.description}{exp.paidTo ? ` · ${exp.paidTo}` : ""} · {exp.paymentMethod}
                    </p>
                  </div>
                  <span className="text-sm font-black text-rose-600 dark:text-rose-400 shrink-0">
                    ₦{Number(exp.amount).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] w-full rounded-2xl p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800 shadow-2xl">
          <DialogHeader className="p-4 border-b dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
            <DialogTitle className="text-xl font-black text-primary">
              Confirm Expense
            </DialogTitle>
            <DialogDescription className="text-xs dark:text-zinc-400 font-medium">
              Review before pushing to Google Sheets.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-gray-100 dark:border-zinc-800">
              <div className="col-span-1">
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 uppercase font-black block mb-0.5 tracking-wider">
                  Date
                </span>
                <span className="dark:text-zinc-200 font-bold">
                  {formData.date}
                </span>
              </div>
              <div className="col-span-1">
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 uppercase font-black block mb-0.5 tracking-wider">
                  Category
                </span>
                <span className="dark:text-zinc-200 font-bold">
                  {formData.category}
                </span>
              </div>
              <div className="col-span-1">
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 uppercase font-black block mb-0.5 tracking-wider">
                  Method
                </span>
                <span className="dark:text-zinc-200 font-bold">
                  {formData.paymentMethod}
                </span>
              </div>
              <div className="col-span-1">
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 uppercase font-black block mb-0.5 tracking-wider">
                  Amount
                </span>
                <span className="font-black text-lg text-red-600 dark:text-rose-400">
                  ₦{Number(formData.amount).toLocaleString()}
                </span>
              </div>
              <div className="col-span-1 border-t dark:border-zinc-800/80 pt-3 mt-1">
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 uppercase font-black block mb-0.5 tracking-wider">
                  Paid To
                </span>
                <span className="dark:text-zinc-200 font-bold">
                  {formData.paidTo || "—"}
                </span>
              </div>
              <div className="col-span-1 border-t dark:border-zinc-800/80 pt-3 mt-1">
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 uppercase font-black block mb-0.5 tracking-wider">
                  Status
                </span>
                <span className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black",
                  formData.status === "Paid"
                    ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400"
                )}>
                  {formData.status}
                </span>
              </div>
              <div className="col-span-2 border-t dark:border-zinc-800/80 pt-3 mt-1">
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 uppercase font-black block mb-0.5 tracking-wider">
                  Description
                </span>
                <span className="dark:text-zinc-300 font-medium leading-relaxed">
                  {formData.description}
                </span>
              </div>
              {formData.receiptUrl && (
                <div className="col-span-2 border-t pt-2 mt-1 text-center">
                  <span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-1">
                    Receipt Preview
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.receiptUrl}
                    alt="Receipt"
                    className="max-h-40 mx-auto rounded-lg shadow-sm border dark:border-zinc-800"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="p-4 bg-gray-50 dark:bg-zinc-900 border-t dark:border-white/5 flex flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              className="flex-1 h-12 text-sm dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400"
            >
              Edit
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-sm font-bold shadow-lg shadow-primary/20 dark:shadow-none"
            >
              Confirm Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
