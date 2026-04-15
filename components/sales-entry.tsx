"use client";

import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MoreHorizontal } from "lucide-react";
import { useSyncStore } from "@/lib/store";

export function SalesEntry() {
  const [nlText, setNlText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    clientName: "",
    jobDescription: "",
    contact: "",
    material: "Flex",
    costPerSqft: "180",
    actualWidth: "",
    actualHeight: "",
    rollSize: "", // empty by default — user must select
    qty: "1",
    initialPayment: "0",
    additionalPayment1: "",
    additionalPayment2: "",
    jobStatus: "Pending",
    dimensionUnit: "ft", // default to feet
  });

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rollSizeTouched, setRollSizeTouched] = useState(false);

  // Sync default cost when material changes
  useEffect(() => {
    if (formData.material === "SAV") {
      setFormData(prev => ({ ...prev, costPerSqft: "200" }));
      // If an invalid roll size for SAV is set, reset to empty
      if (formData.rollSize && !["3", "4", "5"].includes(formData.rollSize)) {
        setFormData(prev => ({ ...prev, rollSize: "" }));
      }
    } else {
      setFormData(prev => ({ ...prev, costPerSqft: "180" }));
    }
  }, [formData.material]);

  // Calculations for UI display
  const calculatedSize = useMemo(() => {
    const w = parseFloat(formData.actualWidth) || 0;
    const h = parseFloat(formData.actualHeight) || 0;
    const rawSize = w * h;
    return formData.dimensionUnit === "in" ? rawSize / 144 : rawSize;
  }, [formData.actualWidth, formData.actualHeight, formData.dimensionUnit]);

  const unitCostVal = useMemo(() => {
    const rate = parseFloat(formData.costPerSqft) || 0;
    return rate * calculatedSize;
  }, [formData.costPerSqft, calculatedSize]);

  const totalAmount = useMemo(() => {
    const q = parseInt(formData.qty) || 0;
    return unitCostVal * q;
  }, [unitCostVal, formData.qty]);

  const amountDifference = useMemo(() => {
    const p1 = parseFloat(formData.initialPayment) || 0;
    return totalAmount - p1;
  }, [totalAmount, formData.initialPayment]);

  const paymentStatus = useMemo(() => {
    if (totalAmount === 0) return "Unpaid";
    if (amountDifference <= 0) return "Paid";
    if (amountDifference < totalAmount) return "Part-payment";
    return "Unpaid";
  }, [amountDifference, totalAmount]);

  const handleNlSubmit = async () => {
    if (!nlText.trim()) return;
    setIsParsing(true);
    try {
      const res = await fetch("/api/parse-nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        const d = json.data;
        setFormData(prev => ({
          ...prev,
          clientName: d["CLIENT NAME"] || prev.clientName,
          jobDescription: d["JOB DESCRIPTION"] || prev.jobDescription,
          contact: d.CONTACT || prev.contact,
          material: d.Material || prev.material,
          costPerSqft: d["COST PER SQRFT"] ? d["COST PER SQRFT"].toString() : prev.costPerSqft,
          actualWidth: d.actualWidth ? d.actualWidth.toString() : "",
          actualHeight: d.actualHeight ? d.actualHeight.toString() : "",
          rollSize: d.rollSize ? d.rollSize.toString() : prev.rollSize,
          qty: d.QTY ? d.QTY.toString() : "1",
          initialPayment: d["INITIAL PAYMENT (₦)"] ? d["INITIAL PAYMENT (₦)"].toString() : "0"
        }));
        setShowConfirmModal(true);
      } else {
        toast.error(json.error || "Failed to parse");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSaveToSheets = async () => {
    const loggedBy = localStorage.getItem("userName") || "Unknown";
    
    // Construct positional array (A to V)
    const needsInchesDivisor = formData.dimensionUnit === "in";
    const sizeFormula =needsInchesDivisor 
      ? `=(${formData.actualWidth}*${formData.actualHeight})/144` 
      : `=(${formData.actualWidth}*${formData.actualHeight})`;
    
    const rowArray = [
      formData.date, // A
      formData.clientName, // B
      formData.jobDescription, // C
      formData.contact, // D
      formData.material, // E
      formData.costPerSqft, // F
      formData.rollSize === "3" ? sizeFormula : "", // G
      formData.rollSize === "4" ? sizeFormula : "", // H
      formData.rollSize === "5" ? sizeFormula : "", // I
      formData.rollSize === "6" ? sizeFormula : "", // J
      formData.rollSize === "8" ? sizeFormula : "", // K
      formData.rollSize === "10" ? sizeFormula : "", // L
      formData.qty, // M
      `=([COL_G_L][ROW]*F[ROW])`, // N - Unit Cost formula (Dimension * Rate)
      parseFloat(formData.initialPayment) || 0, // O - Initial payment (plain number)
      `=(M[ROW]*N[ROW])`, // P - Total formula (Qty * Unit Cost)
      formData.additionalPayment1 === "" ? "" : parseFloat(formData.additionalPayment1) || 0, // Q
      formData.additionalPayment2 === "" ? "" : parseFloat(formData.additionalPayment2) || 0, // R
      `=(P[ROW]-SUM(O[ROW],Q[ROW],R[ROW]))`, // S - Balance (resilient SUM formula)
      `=IF(P[ROW]=0, "Unpaid", IF(S[ROW]<=0, "Paid", IF(S[ROW]<P[ROW], "Part-payment", "Unpaid")))`, // T - Payment status
      formData.jobStatus, // U
      loggedBy // V
    ];

    try {
      // Use the offline sync store
      useSyncStore.getState().addPendingEntry('sale', rowArray);
      
      toast.success("Saved locally! Syncing with Google Sheets in background...");
      setShowConfirmModal(false);
      
      // Reset non-persistent fields
      setFormData(prev => ({
        ...prev,
        clientName: "",
        jobDescription: "",
        contact: "",
        actualWidth: "",
        actualHeight: "",
        initialPayment: "0",
      }));
    } catch(err) {
      toast.error("Error saving locally.");
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto pb-24">
      <Tabs defaultValue="manual" className="w-full">
        <div className="flex justify-center mb-10">
          <TabsList className="bg-gray-100/80 p-1 rounded-full border border-gray-200 shadow-sm">
            <TabsTrigger 
              value="manual" 
              className="px-8 py-2 rounded-full text-sm font-black transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              Manual
            </TabsTrigger>
            <TabsTrigger 
              value="ai" 
              className="px-8 py-2 rounded-full text-sm font-black transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              AI Log
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="manual" className="space-y-6">
          <div className="bg-white border border-gray-100 rounded-[2rem] shadow-sm overflow-hidden p-6 md:p-8">
            {/* Section 1: Client Info */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-gray-900">Client Info</h3>
                <div className="md:hidden"><MoreHorizontal className="w-4 h-4 text-gray-300" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Date</Label>
                  <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="h-12 rounded-xl border-gray-200 focus:ring-indigo-500" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Client Name</Label>
                  <Input placeholder="Sarah Jones" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="h-12 rounded-xl border-gray-200 focus:ring-indigo-500" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Contact Information</Label>
                  <Input placeholder="sarah.jones@email.com" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} className="h-12 rounded-xl border-gray-200 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            {/* Section 2: Job Details */}
            <div className="mb-8 pt-8 border-t border-gray-100">
               <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-gray-900">Job Details</h3>
                <div className="md:hidden"><MoreHorizontal className="w-4 h-4 text-gray-300" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Job Description</Label>
                  <Input placeholder="3x Large Format Banners for Event" value={formData.jobDescription} onChange={e => setFormData({...formData, jobDescription: e.target.value})} className="h-12 rounded-xl border-gray-200 focus:ring-indigo-500" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Material</Label>
                  <Select value={formData.material} onValueChange={(val: string) => setFormData({...formData, material: val})}>
                    <SelectTrigger className="h-12 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="Flex">Flex Banner</SelectItem>
                      <SelectItem value="SAV">SAV (Sticker)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Quantity</Label>
                  <Input type="number" min="1" value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})} className="h-12 rounded-xl border-gray-200" />
                </div>
              </div>
            </div>

            {/* Section 3: Pricing & Dimensions */}
            <div className="pt-8 border-t border-gray-100">
               <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-gray-900">Pricing & Dimensions</h3>
                <div className="md:hidden"><MoreHorizontal className="w-4 h-4 text-gray-300" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-8">
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Actual Size (Width x Height)</Label>
                    <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                      <button 
                        onClick={() => setFormData({...formData, dimensionUnit: 'ft'})}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${formData.dimensionUnit === 'ft' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        FEET
                      </button>
                      <button 
                        onClick={() => setFormData({...formData, dimensionUnit: 'in'})}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${formData.dimensionUnit === 'in' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        INCHES
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                       <Input type="number" placeholder={formData.dimensionUnit === 'ft' ? "5" : "20"} value={formData.actualWidth} onChange={e => setFormData({...formData, actualWidth: e.target.value})} className="h-12 rounded-xl border-gray-200 pr-10" />
                       <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-400 uppercase">{formData.dimensionUnit}</span>
                    </div>
                    <span className="text-gray-400 font-bold text-lg">×</span>
                    <div className="relative flex-1">
                       <Input type="number" placeholder={formData.dimensionUnit === 'ft' ? "3" : "15"} value={formData.actualHeight} onChange={e => setFormData({...formData, actualHeight: e.target.value})} className="h-12 rounded-xl border-gray-200 pr-10" />
                       <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-400 uppercase">{formData.dimensionUnit}</span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">
                    Roll Size Column (Width in ft) <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={formData.rollSize}
                    onValueChange={(val: string) => {
                      setFormData({...formData, rollSize: val});
                      setRollSizeTouched(true);
                    }}
                  >
                    <SelectTrigger className={`h-12 rounded-xl ${rollSizeTouched && !formData.rollSize ? 'border-rose-400 ring-1 ring-rose-400' : 'border-gray-200'}`}>
                      <SelectValue placeholder="Select roll size..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="3">3 FT Roll</SelectItem>
                      <SelectItem value="4">4 FT Roll</SelectItem>
                      <SelectItem value="5">5 FT Roll</SelectItem>
                      {formData.material === "Flex" && (
                         <>
                           <SelectItem value="6">6 FT Roll</SelectItem>
                           <SelectItem value="8">8 FT Roll</SelectItem>
                           <SelectItem value="10">10 FT Roll</SelectItem>
                         </>
                      )}
                    </SelectContent>
                  </Select>
                  {rollSizeTouched && !formData.rollSize && (
                    <p className="text-[11px] text-rose-500 font-bold mt-1">⚠ Please select a roll size before continuing.</p>
                  )}
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Initial Payment (₦)</Label>
                  <Input type="number" placeholder="5000" value={formData.initialPayment} onChange={e => setFormData({...formData, initialPayment: e.target.value})} className="h-12 rounded-xl border-gray-200" />
                </div>

                <div className="md:col-span-2 space-y-1.5 relative">
                  <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Cost Per SQFT (₦)</Label>
                  <Input type="number" value={formData.costPerSqft} onChange={e => setFormData({...formData, costPerSqft: e.target.value})} className="h-12 rounded-xl border-gray-200" />
                  <div className="absolute top-0 right-0 text-[8px] font-black uppercase text-gray-300 tracking-tighter invisible md:visible">
                    Standard Rates: Flex: 180 | SAV: 200
                  </div>
                </div>

                {/* Purple Calculated Bar */}
                <div className="md:col-span-4 mt-4 p-5 bg-[#4f46e5] rounded-2xl shadow-lg shadow-indigo-200/50 flex flex-wrap md:flex-nowrap justify-between items-center gap-4">
                   <div className="flex-1 min-w-[100px] text-center md:text-left">
                      <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1 leading-none">Total Area:</p>
                      <p className="text-lg font-black text-white leading-none">{calculatedSize} sqft</p>
                   </div>
                   <div className="flex-1 min-w-[100px] text-center md:text-left md:border-l md:border-white/10 md:pl-6">
                      <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1 leading-none">Unit Cost:</p>
                      <p className="text-lg font-black text-white leading-none">₦{unitCostVal.toLocaleString()}</p>
                   </div>
                   <div className="flex-1 min-w-[100px] text-center md:text-left md:border-l md:border-white/10 md:pl-6">
                      <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1 leading-none">Total Amount:</p>
                      <p className="text-xl font-black text-white leading-none">₦{totalAmount.toLocaleString()}</p>
                   </div>
                   <div className="flex-1 min-w-[100px] text-center md:text-left md:border-l md:border-white/10 md:pl-6">
                      <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1 leading-none">Balance:</p>
                      <p className="text-xl font-black text-white leading-none">₦{amountDifference.toLocaleString()}</p>
                   </div>
                </div>

                <div className="md:col-span-4 flex flex-col md:flex-row md:items-center justify-between gap-6 mt-4">
                   <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Job Status</Label>
                      <Select value={formData.jobStatus} onValueChange={(val: string) => setFormData({...formData, jobStatus: val})}>
                        <SelectTrigger className="h-12 rounded-xl border-gray-200 w-full md:w-[240px] shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                   </div>
                   <div className="flex flex-col items-center md:items-end">
                      <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-1">Status: <span className={paymentStatus === "Paid" ? "text-emerald-500" : "text-rose-500"}>{paymentStatus.toUpperCase()}</span></p>
                      <Button 
                        onClick={() => {
                          setRollSizeTouched(true);
                          if (!formData.rollSize) return;
                          setShowConfirmModal(true);
                        }}
                        className={`w-full md:w-[320px] h-14 text-white font-black text-lg rounded-2xl shadow-xl transition-all ${
                          !formData.rollSize
                            ? 'bg-gray-300 cursor-not-allowed shadow-gray-100'
                            : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 hover:scale-[1.02]'
                        }`}
                      >
                        Review & Save
                      </Button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="ai">
          <div className="bg-white border border-gray-100 rounded-[2rem] shadow-sm p-6 md:p-10">
            <div className="mb-8">
              <h3 className="text-2xl font-black text-gray-900 mb-2">AI Natural Language Entry</h3>
              <p className="text-gray-500">Describe the print job in plain English and Gemini will fill the form for you.</p>
            </div>
            <div className="mb-6">
              <textarea 
                className="w-full p-6 bg-gray-50 border border-gray-100 rounded-3xl min-h-[220px] focus:ring-4 focus:ring-indigo-500/10 focus:bg-white outline-none transition-all text-xl placeholder:text-gray-300 font-medium" 
                placeholder="e.g. John Doe ordered 3 flex banners sized 7x5ft on a 5ft roll, paid ₦5,000 initially..."
                value={nlText}
                onChange={e => setNlText(e.target.value)}
              />
              <p className="mt-3 text-sm text-gray-400 font-medium px-2">Include material, rolls, dimensions, and customer name for best results.</p>
            </div>
            <Button 
              disabled={isParsing || !nlText} 
              onClick={handleNlSubmit}
              className="w-full h-16 bg-[#4f46e5] hover:bg-indigo-700 text-white font-black text-xl rounded-2xl shadow-xl shadow-indigo-100"
            >
              {isParsing ? "Understanding your request..." : "Extract Data & Fill Form"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-2xl bg-white rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-xl font-bold text-indigo-900">Confirm Entry</DialogTitle>
            <DialogDescription className="text-xs">
              This will update Columns A through V in your Google Sheet.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100">
               <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Client:</span> <span className="text-sm font-semibold text-gray-900 truncate block">{formData.clientName || 'N/A'}</span></div>
               <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Material:</span> <span className="text-sm font-semibold text-gray-900">{formData.material}</span></div>
               <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Dimensions:</span> <span className="text-sm font-semibold text-gray-900">{formData.actualWidth}{formData.dimensionUnit} × {formData.actualHeight}{formData.dimensionUnit}</span></div>
               <div className="col-span-1"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Roll:</span> <span className="text-sm font-semibold text-indigo-600">{formData.rollSize}FT</span></div>
               <div className="col-span-2"><span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Formula:</span> <code className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded whitespace-nowrap">={formData.actualWidth}*{formData.actualHeight}{formData.dimensionUnit === 'in' ? '/144' : ''}</code></div>
            </div>

            <div className="flex flex-col gap-1 border-b pb-2">
               <div className="flex justify-between items-center text-xs">
                 <span className="text-gray-500">Rate: ₦{formData.costPerSqft}</span>
                 <span className="text-gray-500">Qty: {formData.qty}</span>
               </div>
               <div className="flex justify-between items-center text-lg font-black text-indigo-900">
                 <span>Total Amount</span>
                 <span>₦{totalAmount.toLocaleString()}</span>
               </div>
            </div>
            
            <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
               <div className="flex justify-between items-center text-xs font-bold text-orange-800">
                 <span>Payments Logged</span>
                 <span>₦{parseFloat(formData.initialPayment).toLocaleString()}</span>
               </div>
            </div>
          </div>
          <DialogFooter className="p-4 bg-gray-50 border-t flex flex-row gap-2">
             <Button variant="outline" onClick={() => setShowConfirmModal(false)} className="flex-1 h-12 text-sm font-semibold">Back</Button>
             <Button 
                onClick={handleSaveToSheets} 
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-12 text-sm font-bold shadow-sm"
             >
                Confirm Save
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
