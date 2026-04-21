"use client";

import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
  MoreHorizontal, 
  Package, 
  Check, 
  ChevronsUpDown, 
  FileText, 
  Sparkles, 
  Ruler, 
  Calculator,
  Maximize2, 
  MoveHorizontal, 
  Wallet, 
  CheckCircle2, 
  ChevronUp 
} from "lucide-react";
import { useSyncStore } from "@/lib/store";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Drawer } from "vaul";


function RollCard({ 
  width, 
  selected, 
  onClick, 
  disabled 
}: { 
  width: string; 
  selected: boolean; 
  onClick: () => void;
  disabled?: boolean;
}) {
  // Visual height representation based on roll width
  const rollHeights: Record<string, string> = {
    "3": "h-6",
    "4": "h-8",
    "5": "h-10",
    "6": "h-11",
    "8": "h-14",
    "10": "h-16"
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all duration-300 min-h-[100px]",
        selected 
          ? "border-primary bg-primary/5 dark:bg-primary/20 ring-4 ring-primary/10" 
          : "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-primary/20 dark:hover:border-primary/40 shadow-sm",
        disabled && "opacity-30 cursor-not-allowed grayscale"
      )}
    >
      <div className={cn(
        "w-full flex items-center justify-center mb-3",
        selected ? "text-indigo-600" : "text-gray-300 dark:text-zinc-700"
      )}>
        {/* Visual Roll Icon */}
        <div className="relative flex flex-col items-center">
            <div className={cn("w-6 rounded-sm border-2 border-current flex items-center justify-center overflow-hidden transition-all duration-500", rollHeights[width] || "h-8")}>
                <div className="w-[1px] h-full bg-current/20" />
            </div>
            <div className="w-8 h-[2px] bg-current/40 mt-0.5 rounded-full" />
        </div>
      </div>
      <span className={cn(
        "text-xs font-bold uppercase tracking-tight",
        selected ? "text-primary-foreground dark:text-white" : "text-gray-500 dark:text-zinc-400"
      )}>
        {width} FT
      </span>
      <span className="text-[9px] font-bold text-gray-500 dark:text-zinc-500">Width</span>
      {selected && (
        <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
          <CheckCircle2 className="w-3.5 h-3.5" />
        </div>
      )}
    </button>
  );
}

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
  const [inventory, setInventory] = useState<any[]>([]);
  const [openInv, setOpenInv] = useState(false);

  useEffect(() => {
    fetch("/api/inventory")
      .then(res => res.json())
      .then(json => {
        if (json.data) setInventory(json.data);
      })
      .catch(err => console.error("Failed to fetch inventory for selection", err));
  }, []);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rollSizeTouched, setRollSizeTouched] = useState(false);

  // Sync default cost when material changes
  useEffect(() => {
    const prices: Record<string, string> = {
      "Flex": "180",
      "SAV": "200",
      "Window Graphics": "500",
      "Clear Sticker": "350",
      "Blockout": "180",
      "Reflective": "180",
      "Mesh": "180"
    };
    
    if (prices[formData.material]) {
      setFormData(prev => ({ ...prev, costPerSqft: prices[formData.material] }));
    }
    
    // SAV Roll size logic
    if (formData.material === "SAV" && formData.rollSize && !["3", "4", "5"].includes(formData.rollSize)) {
      setFormData(prev => ({ ...prev, rollSize: "" }));
    }
  }, [formData.material]);

  // Calculations for UI display
  const calculatedSize = useMemo(() => {
    const w = parseFloat(formData.actualWidth) || 0;
    const h = parseFloat(formData.actualHeight) || 0;
    const rawSize = w * h;
    return formData.dimensionUnit === "in" ? rawSize / 144 : rawSize;
  }, [formData.actualWidth, formData.actualHeight, formData.dimensionUnit]);

  const totalJobArea = useMemo(() => {
    const q = parseInt(formData.qty) || 0;
    return calculatedSize * q;
  }, [calculatedSize, formData.qty]);

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
    const sizeFormula = needsInchesDivisor 
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
      // Pass both the values array AND the totalArea metadata
      useSyncStore.getState().addPendingEntry('sale', {
        values: rowArray,
        totalArea: totalJobArea
      });
      
      toast.success("Saved locally! Syncing with Google Sheets in background...");
      setShowConfirmModal(false);
      
      // Reset ALL fields to default after saving
      setFormData({
        date: new Date().toISOString().split("T")[0],
        clientName: "",
        jobDescription: "",
        contact: "",
        material: "Flex",
        costPerSqft: "180",
        actualWidth: "",
        actualHeight: "",
        rollSize: "",
        qty: "1",
        initialPayment: "0",
        additionalPayment1: "",
        additionalPayment2: "",
        jobStatus: "Pending",
        dimensionUnit: "ft",
      });
      setNlText("");
      setRollSizeTouched(false);
    } catch(err) {
      toast.error("Error saving locally.");
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto pb-24">
      <Tabs defaultValue="manual" className="w-full">
        <div className="flex justify-center mb-10">
          <TabsList className="bg-gray-100/80 dark:bg-zinc-800/80 p-1.5 rounded-full border border-gray-200 dark:border-zinc-700 shadow-sm gap-1">
            <TabsTrigger 
              value="manual" 
              className="px-5 py-2 rounded-full text-sm font-bold transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg dark:text-zinc-400 gap-2 data-[state=active]:ring-2 data-[state=active]:ring-primary/20"
            >
              <span>✏️</span>
              Manual
            </TabsTrigger>
            <TabsTrigger 
              value="ai" 
              className="px-5 py-2 rounded-full text-sm font-bold transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg dark:text-zinc-400 gap-2 data-[state=active]:ring-2 data-[state=active]:ring-primary/20"
            >
              <span>⚡</span>
              AI Log
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="manual" className="space-y-6">
          <div className="bg-white dark:bg-zinc-900/50 border border-gray-100 dark:border-white/5 rounded-[2rem] shadow-sm overflow-hidden p-6 md:p-8 transition-colors">
            {/* Section 1: Client Info */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Client Info</h3>
                <div className="md:hidden"><MoreHorizontal className="w-4 h-4 text-gray-300 dark:text-zinc-600" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Date</Label>
                  <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Client Name</Label>
                  <Input placeholder="Sarah Jones" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Contact Information</Label>
                  <Input placeholder="sarah.jones@email.com" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary" />
                </div>
              </div>
            </div>

            {/* Section 2: Job Details */}
            <div className="mb-8 pt-8 border-t border-gray-100 dark:border-white/5">
               <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Job Details</h3>
                <div className="md:hidden"><MoreHorizontal className="w-4 h-4 text-gray-300 dark:text-zinc-600" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Job Description</Label>
                    {inventory.length > 0 && (
                      <Popover open={openInv} onOpenChange={setOpenInv}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-bold uppercase text-primary dark:text-primary-foreground hover:bg-primary/10 flex items-center gap-1"
                          >
                            <Package className="w-3 h-3" />
                            Use Inventory
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0 rounded-xl bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800" align="end">
                          <Command className="dark:bg-zinc-950">
                            <CommandInput placeholder="Search inventory..." className="h-9" />
                            <CommandList>
                              <CommandEmpty>No item found.</CommandEmpty>
                              <CommandGroup>
                                {inventory.map((item) => (
                                  <CommandItem
                                    key={item["Item Name"]}
                                    onSelect={() => {
                                      setFormData({
                                        ...formData,
                                        jobDescription: item["Item Name"],
                                        costPerSqft: item["Price"]?.toString() || formData.costPerSqft
                                      });
                                      setOpenInv(false);
                                      toast.info(`Selected ${item["Item Name"]}`);
                                    }}
                                    className="font-bold text-xs dark:hover:bg-zinc-900 cursor-pointer"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.jobDescription === item["Item Name"] ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {item["Item Name"]} (₦{parseFloat(item.Price).toLocaleString()})
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <Input placeholder="3x Large Format Banners for Event" value={formData.jobDescription} onChange={e => setFormData({...formData, jobDescription: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Material</Label>
                  <Select value={formData.material} onValueChange={(val: string) => setFormData({...formData, material: val})}>
                    <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl dark:bg-zinc-950 dark:border-zinc-800">
                      <SelectItem value="Flex">Flex Banner</SelectItem>
                      <SelectItem value="SAV">SAV (Sticker)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Quantity</Label>
                  <Input type="number" min="1" value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950" />
                </div>
              </div>
            </div>

            {/* Section 3: Pricing & Dimensions */}
            <div className="pt-8 border-t border-gray-100 dark:border-white/5">
               <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Pricing & Dimensions</h3>
                <div className="md:hidden"><MoreHorizontal className="w-4 h-4 text-gray-300 dark:text-zinc-600" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-8">
                <div className="md:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Actual Size (Width x Height)</Label>
                    <div className="flex bg-gray-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-gray-200 dark:border-zinc-800">
                      <button 
                        onClick={() => setFormData({...formData, dimensionUnit: 'ft'})}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${formData.dimensionUnit === 'ft' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300'}`}
                      >
                        FEET
                      </button>
                      <button 
                        onClick={() => setFormData({...formData, dimensionUnit: 'in'})}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${formData.dimensionUnit === 'in' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300'}`}
                      >
                        INCHES
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="relative flex-1 group">
                        <Input type="number" placeholder={formData.dimensionUnit === 'ft' ? "5" : "20"} value={formData.actualWidth} onChange={e => setFormData({...formData, actualWidth: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 pr-10 focus:ring-primary font-bold" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary/60 uppercase">{formData.dimensionUnit}</span>
                     </div>
                     <span className="text-gray-400 font-bold text-lg flex-shrink-0">×</span>
                     <div className="relative flex-1 group">
                        <Input type="number" placeholder={formData.dimensionUnit === 'ft' ? "3" : "15"} value={formData.actualHeight} onChange={e => setFormData({...formData, actualHeight: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 pr-10 focus:ring-primary font-bold" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary/60 uppercase">{formData.dimensionUnit}</span>
                     </div>
                     {/* Inline live sqft chip */}
                     {calculatedSize > 0 && (
                       <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 h-12 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                         <span className="text-[8px] font-semibold text-primary/60 uppercase tracking-wider leading-none">= sqft</span>
                         <span className="text-sm font-black text-primary leading-none">{calculatedSize.toFixed(1)}</span>
                       </div>
                     )}
                  </div>
                </div>


                <div className="md:col-span-2 space-y-3">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">
                    Roll Size <span className="text-muted-foreground font-medium text-[9px]">(Width in ft)</span> <span className="text-rose-500">*</span>
                  </Label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {["3", "4", "5", "6", "8", "10"].map((size) => {
                      const isDisabled = formData.material === "SAV" && !["3", "4", "5"].includes(size);
                      return (
                        <RollCard
                          key={size}
                          width={size}
                          selected={formData.rollSize === size}
                          disabled={isDisabled}
                          onClick={() => {
                            setFormData({...formData, rollSize: size});
                            setRollSizeTouched(true);
                          }}
                        />
                      );
                    })}
                  </div>
                  {rollSizeTouched && !formData.rollSize && (
                    <p className="text-[11px] text-rose-500 font-black mt-1 uppercase tracking-tighter">⚠ Roll size is required</p>
                  )}
                </div>

                <div className="md:col-span-1 space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Initial Payment (₦)</Label>
                  <Input type="number" placeholder="5000" value={formData.initialPayment} onChange={e => setFormData({...formData, initialPayment: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 font-bold" />
                </div>

                <div className="md:col-span-1 space-y-1.5 relative">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Cost Per SQFT (₦)</Label>
                  <Input type="number" value={formData.costPerSqft} onChange={e => setFormData({...formData, costPerSqft: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 font-bold" />
                </div>

                {/* Pricing Preview Section */}
                <div className="md:col-span-4 bg-gray-50/50 dark:bg-zinc-900/30 rounded-2xl p-4 border border-gray-100 dark:border-white/5 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calculator className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-500">Live Calculation Preview</span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-tighter">Job Area</p>
                      <div className="flex items-baseline gap-1">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{calculatedSize.toFixed(2)}</p>
                        <span className="text-[10px] font-medium text-gray-500 uppercase">sqft</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-tighter">Unit Cost</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[10px] font-medium text-gray-500">₦</span>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{unitCostVal.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-tighter">Total Items</p>
                      <div className="flex items-baseline gap-1">
                         <p className="text-lg font-bold text-gray-900 dark:text-white">{formData.qty || 1}</p>
                         <span className="text-[10px] font-medium text-gray-500 uppercase">Units</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-tighter">Rate Applied</p>
                      <div className="flex items-center gap-1.5">
                         <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 border-primary/20 text-primary dark:text-primary-foreground">
                           {formData.material}
                         </Badge>
                         <span className="text-[10px] font-medium text-gray-500">@ ₦{formData.costPerSqft}/sqft</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop Primary Calculated Bar */}
                <div className="hidden md:flex md:col-span-4 p-5 bg-primary rounded-3xl shadow-lg shadow-primary/20 dark:shadow-none justify-between items-center gap-4 border border-white/10">
                   <div className="flex-1 min-w-[100px]">
                      <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Total Area:</p>
                      <p className="text-xl font-bold text-primary-foreground leading-none">{totalJobArea.toFixed(2)} sqft</p>
                   </div>
                   <div className="flex-1 min-w-[100px] border-l border-white/10 pl-6">
                      <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Final Total:</p>
                      <p className="text-2xl font-bold text-primary-foreground leading-none">₦{totalAmount.toLocaleString()}</p>
                   </div>
                   <div className="flex-1 min-w-[100px] border-l border-white/10 pl-6">
                      <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Initial Paid:</p>
                      <p className="text-xl font-bold text-primary-foreground leading-none">₦{(parseFloat(formData.initialPayment) || 0).toLocaleString()}</p>
                   </div>
                   <div className="flex-1 min-w-[100px] border-l border-white/10 pl-6">
                      <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Balance Due:</p>
                      <p className="text-2xl font-bold text-primary-foreground leading-none">₦{amountDifference.toLocaleString()}</p>
                   </div>
                </div>

                <div className="md:col-span-4 flex flex-col md:flex-row md:items-center justify-between gap-6 mt-4">
                   <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">Job Status</Label>
                      <Select value={formData.jobStatus} onValueChange={(val: string) => setFormData({...formData, jobStatus: val})}>
                        <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 w-full md:w-[240px] shadow-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl dark:bg-zinc-950 dark:border-zinc-800">
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                   </div>
                   <div className="flex flex-col items-center md:items-end">
                      <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-500 tracking-widest mb-1">Status: <span className={paymentStatus === "Paid" ? "text-emerald-500" : "text-rose-500"}>{paymentStatus.toUpperCase()}</span></p>
                      <Button 
                        onClick={() => {
                          setRollSizeTouched(true);
                          if (!formData.rollSize) return;
                          setShowConfirmModal(true);
                        }}
                        className={`w-full md:w-[320px] h-14 text-white font-bold text-lg rounded-2xl shadow-xl transition-all ${
                          !formData.rollSize
                            ? 'bg-gray-300 dark:bg-zinc-800 cursor-not-allowed shadow-none'
                            : 'bg-primary hover:bg-primary/90 shadow-primary/20 dark:shadow-none hover:scale-[1.02]'
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
          <div className="bg-white dark:bg-zinc-900/50 border border-gray-100 dark:border-white/5 rounded-[2rem] shadow-sm p-6 md:p-10 transition-colors">
            <div className="mb-8">
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">AI Natural Language Entry</h3>
              <p className="text-gray-500 dark:text-zinc-400">Describe the print job in plain English and Gemini will fill the form for you.</p>
            </div>
            <div className="mb-6">
              <textarea 
                className="w-full p-6 bg-gray-50 dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800 rounded-3xl min-h-[220px] focus:ring-4 focus:ring-indigo-500/10 dark:focus:ring-indigo-500/5 focus:bg-white dark:focus:bg-zinc-900 outline-none transition-all text-xl placeholder:text-gray-300 dark:placeholder:text-zinc-700 dark:text-white font-medium" 
                placeholder="e.g. John Doe ordered 3 flex banners sized 7x5ft on a 5ft roll, paid ₦5,000 initially..."
                value={nlText}
                onChange={e => setNlText(e.target.value)}
              />
              <p className="mt-3 text-sm text-gray-400 dark:text-zinc-500 font-medium px-2">Include material, rolls, dimensions, and customer name for best results.</p>
            </div>
            <Button 
              disabled={isParsing || !nlText} 
              onClick={handleNlSubmit}
              className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xl rounded-2xl shadow-xl shadow-primary/20 dark:shadow-none transition-all"
            >
              {isParsing ? "Understanding your request..." : "Extract Data & Fill Form"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Mobile Sticky Summary Drawer */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 z-40">
        <Drawer.Root>
          <Drawer.Trigger asChild>
            <button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl p-4 shadow-2xl shadow-primary/20 flex items-center justify-between group active:scale-95 transition-all">
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-primary-foreground/80">Total Amount</span>
                <span className="text-xl font-bold">₦{totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-wide">Summary</span>
                <ChevronUp className="w-4 h-4 group-data-[state=open]:rotate-180 transition-transform" />
              </div>
            </button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 animate-in fade-in" />
            <Drawer.Content className="bg-white dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] mt-24 fixed bottom-0 left-0 right-0 z-50 p-6 outline-none shadow-2xl border-t dark:border-zinc-800">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mb-8" />
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" />
                    Price Breakdown
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Detailed calculation for your current inputs.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-white/5">
                    <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-1">Total Area</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{calculatedSize.toFixed(2)} sqft</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-white/5">
                    <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-1">Unit Cost</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">₦{unitCostVal.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-primary/5 dark:bg-primary/20 border border-primary/10 col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[9px] font-bold text-primary dark:text-primary-foreground uppercase tracking-widest">Total Amount</p>
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                    </div>
                    <p className="text-3xl font-bold text-primary dark:text-white">₦{totalAmount.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/10 col-span-2">
                    <p className="text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1">Remaining Balance</p>
                    <p className="text-3xl font-bold text-rose-600 dark:text-white">₦{amountDifference.toLocaleString()}</p>
                  </div>
                </div>

                <Button 
                  onClick={() => {
                    setRollSizeTouched(true);
                    if (!formData.rollSize) {
                      toast.error("Please select a roll size");
                      return;
                    }
                    setShowConfirmModal(true);
                  }}
                  className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xl rounded-2xl shadow-xl shadow-primary/20"
                >
                  Review & Save Job
                </Button>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-2xl bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 rounded-2xl p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-4 border-b dark:border-zinc-800">
            <DialogTitle className="text-xl font-bold text-primary dark:text-primary-foreground">Confirm Entry</DialogTitle>
            <DialogDescription className="text-xs dark:text-zinc-500">
              This will update Columns A through V in your Google Sheet.
            </DialogDescription>
          </DialogHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm bg-gray-50 dark:bg-zinc-900 p-4 rounded-xl border border-gray-100 dark:border-white/5">
               <div className="col-span-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-bold block mb-0.5">Client:</span> <span className="text-sm font-semibold text-gray-900 dark:text-white truncate block">{formData.clientName || 'N/A'}</span></div>
               <div className="col-span-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-bold block mb-0.5">Material:</span> <span className="text-sm font-semibold text-gray-900 dark:text-white">{formData.material}</span></div>
               <div className="col-span-1"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-bold block mb-0.5">Dimensions:</span> <span className="text-sm font-semibold text-gray-900 dark:text-white">{formData.actualWidth}{formData.dimensionUnit} × {formData.actualHeight}{formData.dimensionUnit}</span></div>
               <div className="col-span-1"><span className="text-[10px] text-gray-400 dark:text-zinc-500 uppercase font-bold block mb-0.5">Roll:</span> <span className="text-sm font-semibold text-primary dark:text-primary-foreground">{formData.rollSize}FT</span></div>
                <div className="col-span-2"><span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-bold block mb-0.5">Formula:</span> <code className="text-xs bg-primary/10 text-primary dark:text-primary-foreground px-2 py-0.5 rounded whitespace-nowrap">={formData.actualWidth}*{formData.actualHeight}{formData.dimensionUnit === 'in' ? '/144' : ''}</code></div>
            </div>

            <div className="flex flex-col gap-1 border-b dark:border-zinc-800 pb-2">
               <div className="flex justify-between items-center text-xs">
                 <span className="text-gray-500 dark:text-zinc-500">Rate: ₦{formData.costPerSqft}</span>
                 <span className="text-gray-500 dark:text-zinc-500">Qty: {formData.qty}</span>
               </div>
               <div className="flex justify-between items-center text-lg font-bold text-primary dark:text-primary-foreground">
                 <span>Total Amount</span>
                 <span>₦{totalAmount.toLocaleString()}</span>
               </div>
            </div>
            
            <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-lg">
               <div className="flex justify-between items-center text-xs font-bold text-orange-800 dark:text-orange-300">
                 <span>Payments Logged</span>
                 <span>₦{parseFloat(formData.initialPayment).toLocaleString()}</span>
               </div>
            </div>
          <DialogFooter className="p-4 bg-gray-50 dark:bg-zinc-900/50 border-t dark:border-zinc-800 flex flex-row gap-2">
             <Button variant="outline" onClick={() => setShowConfirmModal(false)} className="flex-1 h-12 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">Back</Button>
             <Button 
                onClick={handleSaveToSheets} 
                className="flex-1 bg-primary hover:bg-primary/90 h-12 text-sm font-bold shadow-sm"
             >
                Confirm Save
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
