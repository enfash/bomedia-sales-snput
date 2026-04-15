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

const EXPENSE_CATEGORIES = [
  "Raw Materials",
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

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "",
    description: "",
    paidTo: "",
    paymentMethod: "Cash",
  });

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
      });
    } catch(err) {
      toast.error("Error saving expense locally.");
    }
  };

  return (
    <>
      <div className="w-full max-w-2xl mx-auto p-2 md:p-4">
        <Card className="border-indigo-100 shadow-sm overflow-hidden">
          <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 p-4">
            <CardTitle className="text-indigo-900 text-lg">Expense Entry</CardTitle>
            <CardDescription className="text-xs">Record expenditures to the Expenses sheet.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 px-4">
            <div className="space-y-1">
              <Label htmlFor="exp-date" className="text-xs font-semibold text-gray-700">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="border-indigo-100"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-amount" className="text-xs font-semibold text-gray-700">Amount (₦)</Label>
              <Input
                id="exp-amount"
                type="number"
                placeholder="e.g. 15000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="border-indigo-100"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-category" className="text-xs font-semibold text-gray-700">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(val: string) => setFormData({ ...formData, category: val })}
              >
                <SelectTrigger id="exp-category" className="border-indigo-100">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-method" className="text-xs font-semibold text-gray-700">Method</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(val: string) => setFormData({ ...formData, paymentMethod: val })}
              >
                <SelectTrigger id="exp-method" className="border-indigo-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="POS">POS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-paidto" className="text-xs font-semibold text-gray-700">Paid To</Label>
              <Input
                id="exp-paidto"
                placeholder="Vendor/Person"
                value={formData.paidTo}
                onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
                className="border-indigo-100"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="exp-desc" className="text-xs font-semibold text-gray-700">Description</Label>
              <Input
                id="exp-desc"
                placeholder="Reason for expense"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="border-indigo-100"
              />
            </div>
          </CardContent>
          <CardFooter className="p-4 border-t bg-gray-50/50">
            <Button onClick={handleReview} className="w-full bg-indigo-600 hover:bg-indigo-700 py-6 text-base font-bold rounded-xl shadow-lg shadow-indigo-100">Review & Save</Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] w-full rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-xl font-bold text-indigo-900">Confirm Expense</DialogTitle>
            <DialogDescription className="text-xs">Review before pushing to Google Sheets.</DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Date</span><span>{formData.date}</span></div>
              <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Category</span><span>{formData.category}</span></div>
              <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Method</span><span>{formData.paymentMethod}</span></div>
              <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Amount</span><span className="font-bold text-red-600">₦{Number(formData.amount).toLocaleString()}</span></div>
              <div className="col-span-2"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Paid To</span><span>{formData.paidTo || "—"}</span></div>
              <div className="col-span-2 border-t pt-2 mt-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Description</span><span>{formData.description}</span></div>
            </div>
          </div>
          <DialogFooter className="p-4 bg-gray-50 border-t flex flex-row gap-2">
            <Button variant="outline" onClick={() => setShowConfirmModal(false)} className="flex-1 h-12 text-sm">Edit</Button>
            <Button onClick={handleSave} disabled={isSaving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-12 text-sm font-bold">
              Confirm Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
