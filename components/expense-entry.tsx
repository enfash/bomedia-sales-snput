"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSyncStore } from "@/lib/store";
import { Camera, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { 
  Command, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput, 
  CommandItem, 
  CommandList 
} from "@/components/ui/command";

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

export function ExpenseEntry() {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "",
    description: "",
    paidTo: "",
    paymentMethod: "Cash",
    receiptUrl: "",
  });

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
      setFormData(prev => ({ ...prev, receiptUrl: url }));
      toast.success("Receipt uploaded successfully!", { id: uploadToast });
    } catch (err: any) {
      toast.error("Failed to upload photo. You can try again or save without it.", { id: uploadToast });
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
    };

    try {
      // Save locally to the sync queue
      useSyncStore.getState().addPendingEntry('expense', payload);
      
      toast.success("Expense recorded locally! Syncing in background...");
      setShowConfirmModal(false);
      
      setFormData({
        date: new Date().toISOString().split("T")[0],
        amount: "",
        category: "",
        description: "",
        paidTo: "",
        paymentMethod: "Cash",
        receiptUrl: "",
      });
    } catch(err) {
      toast.error("Error saving expense locally.");
    }
  };

  return (
    <>
      <div className="w-full max-w-2xl mx-auto p-2 md:p-4">
        <Card className="border-indigo-100 dark:border-zinc-800 shadow-sm overflow-hidden dark:bg-zinc-900 transition-colors">
          <CardHeader className="bg-indigo-50/50 dark:bg-zinc-800/50 border-b border-indigo-100 dark:border-zinc-800 p-4">
            <CardTitle className="text-indigo-900 dark:text-indigo-400 text-lg font-black">Expense Entry</CardTitle>
            <CardDescription className="text-xs dark:text-zinc-500 font-medium">Record expenditures to the Expenses sheet.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 px-4">
            <div className="space-y-1">
              <Label htmlFor="exp-date" className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-amount" className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500">Amount (₦)</Label>
              <Input
                id="exp-amount"
                type="number"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 font-bold"
              />
            </div>
            <div className="space-y-1 flex flex-col">
              <Label htmlFor="exp-category" className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500">Category</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="exp-category"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="justify-between rounded-xl border-indigo-100 dark:border-zinc-800 font-bold h-10 px-3 bg-white dark:bg-zinc-950 hover:bg-white dark:hover:bg-zinc-900 transition-all text-sm"
                  >
                    <span className={formData.category ? "text-gray-900 dark:text-zinc-100" : "text-gray-400 dark:text-zinc-600"}>
                      {formData.category || "Select category..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 dark:bg-zinc-950 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xl" align="start">
                  <Command className="dark:bg-zinc-950">
                    <CommandInput placeholder="Search category..." className="dark:text-zinc-100" />
                    <CommandList>
                      <CommandEmpty>No category found.</CommandEmpty>
                      <CommandGroup>
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <CommandItem
                            key={cat}
                            value={cat}
                            onSelect={(currentValue) => {
                              setFormData({ ...formData, category: currentValue });
                              setOpen(false);
                            }}
                            className="flex items-center justify-between font-bold dark:text-zinc-300 dark:aria-selected:bg-zinc-900 dark:aria-selected:text-white"
                          >
                            <span>{cat}</span>
                            <Check
                              className={cn(
                                "h-4 w-4 text-indigo-600 dark:text-indigo-400",
                                formData.category === cat ? "opacity-100" : "opacity-0"
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
              <Label htmlFor="exp-method" className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500">Method</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(val: string) => setFormData({ ...formData, paymentMethod: val })}
              >
                <SelectTrigger id="exp-method" className="rounded-xl border-indigo-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-zinc-950 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                  <SelectItem value="Cash" className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-900 dark:focus:text-white">Cash</SelectItem>
                  <SelectItem value="Bank Transfer" className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-900 dark:focus:text-white">Bank Transfer</SelectItem>
                  <SelectItem value="POS" className="font-bold dark:text-zinc-300 dark:focus:bg-zinc-900 dark:focus:text-white">POS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-paidto" className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500">Paid To</Label>
              <Input
                id="exp-paidto"
                placeholder="Vendor/Person"
                value={formData.paidTo}
                onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 font-bold"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="exp-desc" className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500">Description</Label>
              <Input
                id="exp-desc"
                placeholder="Reason for expense"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="rounded-xl border-border dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 font-bold"
              />
            </div>
            
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="exp-photo" className="text-[10px] uppercase font-black text-gray-700 dark:text-zinc-500">Receipt Photo (Optional)</Label>
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
                  <div className={cn(
                    "flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-3 transition-colors",
                    formData.receiptUrl 
                      ? "bg-green-50 dark:bg-emerald-950/20 border-green-200 dark:border-emerald-900/30 text-green-700 dark:text-emerald-400" 
                      : "bg-gray-50 dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-900"
                  )}>
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : formData.receiptUrl ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                    <span className="text-sm font-medium">
                      {isUploading ? "Uploading..." : formData.receiptUrl ? "Photo Attached" : "Take Photo / Upload"}
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
            <Button onClick={handleReview} className="w-full bg-primary hover:bg-primary/95 text-primary-foreground py-6 text-base font-bold rounded-xl shadow-lg shadow-primary/20 dark:shadow-none transition-all active:scale-[0.98]">Review & Save</Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] w-full rounded-2xl p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800 shadow-2xl">
          <DialogHeader className="p-4 border-b dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
            <DialogTitle className="text-xl font-black text-indigo-900 dark:text-indigo-400">Confirm Expense</DialogTitle>
            <DialogDescription className="text-xs dark:text-zinc-500 font-medium">Review before pushing to Google Sheets.</DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-gray-100 dark:border-zinc-800">
              <div className="col-span-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-0.5 tracking-wider">Date</span><span className="dark:text-zinc-200 font-bold">{formData.date}</span></div>
              <div className="col-span-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-0.5 tracking-wider">Category</span><span className="dark:text-zinc-200 font-bold">{formData.category}</span></div>
              <div className="col-span-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-0.5 tracking-wider">Method</span><span className="dark:text-zinc-200 font-bold">{formData.paymentMethod}</span></div>
              <div className="col-span-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-0.5 tracking-wider">Amount</span><span className="font-black text-lg text-red-600 dark:text-rose-400">₦{Number(formData.amount).toLocaleString()}</span></div>
              <div className="col-span-2 border-t dark:border-zinc-800/80 pt-3 mt-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-0.5 tracking-wider">Paid To</span><span className="dark:text-zinc-200 font-bold">{formData.paidTo || "—"}</span></div>
              <div className="col-span-2 border-t dark:border-zinc-800/80 pt-3 mt-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-0.5 tracking-wider">Description</span><span className="dark:text-zinc-300 font-medium leading-relaxed">{formData.description}</span></div>
              {formData.receiptUrl && (
                <div className="col-span-2 border-t pt-2 mt-1 text-center">
                  <span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-black block mb-1">Receipt Preview</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={formData.receiptUrl} alt="Receipt" className="max-h-40 mx-auto rounded-lg shadow-sm border dark:border-zinc-800" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="p-4 bg-gray-50 dark:bg-zinc-900 border-t dark:border-white/5 flex flex-row gap-2">
            <Button variant="outline" onClick={() => setShowConfirmModal(false)} className="flex-1 h-12 text-sm dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400">Edit</Button>
            <Button onClick={handleSave} disabled={isSaving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-sm font-bold shadow-lg shadow-primary/20 dark:shadow-none">
              Confirm Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
