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

interface JobData {
  jobDescription: string;
  material: string;
  costPerSqft: string;
  actualWidth: string;
  actualHeight: string;
  rollSize: string;
  qty: string;
  dimensionUnit: string;
  fromInventory?: boolean;
}


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
        selected ? "text-primary" : "text-gray-300 dark:text-zinc-700"
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
        selected ? "text-primary-foreground dark:text-white" : "text-gray-600 dark:text-zinc-300"
      )}>
        {width} FT
      </span>
      <span className="text-[9px] font-bold text-gray-600 dark:text-zinc-400">Width</span>
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
  
  const [batchData, setBatchData] = useState({
    date: new Date().toISOString().split("T")[0],
    clientName: "",
    contact: "",
    jobStatus: "Quoted",
    initialPayment: "0",
  });

  const [jobData, setJobData] = useState<JobData>({
    jobDescription: "",
    material: "Flex",
    costPerSqft: "180",
    actualWidth: "",
    actualHeight: "",
    rollSize: "",
    qty: "1",
    dimensionUnit: "ft",
    fromInventory: false,
  });
  
  const [cart, setCart] = useState<any[]>([]);
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
  const [clientNameTouched, setClientNameTouched] = useState(false);
  const [dimensionsTouched, setDimensionsTouched] = useState(false);

  const cachedSales = useSyncStore(state => state.cachedSales);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const uniqueClients = useMemo(() => {
    if (!cachedSales || !Array.isArray(cachedSales)) return [];
    const names = new Set<string>();
    cachedSales.forEach((sale: any) => {
      const name = sale["CLIENT NAME"] || sale["Client Name"];
      if (name && typeof name === "string" && name.trim() !== "") {
        names.add(name.trim());
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [cachedSales]);

  const clientContacts = useMemo(() => {
    if (!cachedSales || !Array.isArray(cachedSales)) return {} as Record<string, string>;
    const contacts: Record<string, string> = {};
    cachedSales.forEach((sale: any) => {
      const name = (sale["CLIENT NAME"] || sale["Client Name"] || "").trim();
      const contact = (sale["CONTACT"] || sale["Contact"] || "").trim();
      if (name && contact) {
        contacts[name] = contact;
      }
    });
    return contacts;
  }, [cachedSales]);

  const filteredClients = useMemo(() => {
    if (!batchData.clientName) return uniqueClients;
    const lower = batchData.clientName.toLowerCase();
    return uniqueClients.filter(c => c.toLowerCase().includes(lower));
  }, [uniqueClients, batchData.clientName]);

  // Detect available roll size and price automatically from inventory
  useEffect(() => {
    const w = parseFloat(jobData.actualWidth) || 0;
    const widthInFt = jobData.dimensionUnit === 'in' ? w / 12 : w;
    
    if (inventory && inventory.length > 0) {
      const matItems = inventory.filter(item => 
        item['Material Type']?.toLowerCase().includes(jobData.material.toLowerCase()) || 
        jobData.material.toLowerCase().includes(item['Material Type']?.toLowerCase())
      );
      
      if (matItems.length > 0) {
        const priceMatch = matItems[0]['Price per Sqft'];
        
        if (widthInFt > 0) {
          const widthMatch = matItems.find(item => {
            const widthVal = parseFloat(item['Width (ft)']) || 0;
            return Math.abs(widthVal - widthInFt) < 0.1;
          });
          
          if (widthMatch) {
            setJobData(prev => ({ 
              ...prev, 
              rollSize: widthMatch['Width (ft)']?.toString(),
              costPerSqft: widthMatch['Price per Sqft']?.toString() || prev.costPerSqft
            }));
          } else if (priceMatch) {
            setJobData(prev => ({ ...prev, costPerSqft: priceMatch.toString() }));
          }
        } else if (priceMatch) {
          setJobData(prev => ({ ...prev, costPerSqft: priceMatch.toString() }));
        }
      }
    }
  }, [jobData.material, jobData.actualWidth, jobData.dimensionUnit, inventory]);

  // Calculations for UI display
  const calculatedSize = useMemo(() => {
    const w = parseFloat(jobData.actualWidth) || 0;
    const h = parseFloat(jobData.actualHeight) || 0;
    const rawSize = w * h;
    return jobData.dimensionUnit === "in" ? rawSize / 144 : rawSize;
  }, [jobData.actualWidth, jobData.actualHeight, jobData.dimensionUnit]);

  const totalJobArea = useMemo(() => {
    const q = parseInt(jobData.qty) || 0;
    return calculatedSize * q;
  }, [calculatedSize, jobData.qty]);

  const unitCostVal = useMemo(() => {
    const rate = parseFloat(jobData.costPerSqft) || 0;
    return rate * calculatedSize;
  }, [jobData.costPerSqft, calculatedSize]);

  const totalAmount = useMemo(() => {
    const q = parseInt(jobData.qty) || 0;
    return unitCostVal * q;
  }, [unitCostVal, jobData.qty]);

  const grandTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.totalAmount, 0);
  }, [cart]);

  const amountDifference = useMemo(() => {
    const p1 = parseFloat(batchData.initialPayment) || 0;
    return grandTotal - p1;
  }, [grandTotal, batchData.initialPayment]);

  const paymentStatus = useMemo(() => {
    if (grandTotal === 0) return "Unpaid";
    if (amountDifference <= 0) return "Paid";
    if (amountDifference < grandTotal) return "Part-payment";
    return "Unpaid";
  }, [amountDifference, grandTotal]);

  const availableRollSizes = useMemo(() => {
    if (!inventory || inventory.length === 0) {
      return ["3", "4", "5", "6", "8", "10"];
    }
    
    const sizes = inventory
      .filter(item => 
        item['Material Type']?.toLowerCase().includes(jobData.material.toLowerCase()) || 
        jobData.material.toLowerCase().includes(item['Material Type']?.toLowerCase())
      )
      .map(item => parseFloat(item['Width (ft)'])?.toString())
      .filter((val, idx, self) => val && self.indexOf(val) === idx);
      
    return sizes.length > 0 ? sizes.sort((a,b) => parseFloat(a) - parseFloat(b)) : ["3", "4", "5", "6", "8", "10"];
  }, [inventory, jobData.material]);

  const handleAddToCart = () => {
    setRollSizeTouched(true);
    setDimensionsTouched(true);
    if (!jobData.rollSize || !jobData.actualWidth || !jobData.actualHeight) {
      if (!jobData.rollSize) toast.error("Please select a roll size");
      if (!jobData.actualWidth || !jobData.actualHeight) toast.error("Please enter both width and height");
      return;
    }

    // Enforce remaining stock boundaries
    if (inventory && inventory.length > 0) {
      const match = inventory.find(item => {
        const matMatch = item['Material Type']?.toLowerCase().includes(jobData.material.toLowerCase()) || 
                         jobData.material.toLowerCase().includes(item['Material Type']?.toLowerCase());
        const widthVal = parseFloat(item['Width (ft)']) || 0;
        const rollSizeVal = parseFloat(jobData.rollSize) || 0;
        return matMatch && Math.abs(widthVal - rollSizeVal) < 0.1;
      });

      if (match) {
        const availableStock = parseFloat(match['Available Stock']) || 0;
        if (availableStock < totalJobArea) {
          toast.error(`Insufficient inventory stock! Available: ${availableStock.toFixed(1)} sqft, Required: ${totalJobArea.toFixed(1)} sqft.`);
          return;
        }
      }
    }

    setCart(prev => [...prev, {
      id: crypto.randomUUID(),
      ...jobData,
      fromInventory: jobData.fromInventory ?? false,
      calculatedSize,
      totalJobArea,
      unitCostVal,
      totalAmount
    }]);

    setJobData({
      jobDescription: "",
      material: "Flex",
      costPerSqft: "180",
      actualWidth: "",
      actualHeight: "",
      rollSize: "",
      qty: "1",
      dimensionUnit: "ft",
      fromInventory: false,
    });
    setRollSizeTouched(false);
    setDimensionsTouched(false);
    toast.success("Job added to order");
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleReviewAndSave = () => {
    setClientNameTouched(true);
    if (!batchData.clientName) {
      toast.error("Please enter a client name");
      // Scroll to the top or the client name field if possible, but at least show the toast
      return;
    }
    if (cart.length === 0) {
      toast.error("Order is empty. Add at least one job.");
      return;
    }
    setShowConfirmModal(true);
  };

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
        setBatchData(prev => ({
          ...prev,
          clientName: d["CLIENT NAME"] || prev.clientName,
          contact: d.CONTACT || prev.contact,
          initialPayment: d["INITIAL PAYMENT (₦)"] ? d["INITIAL PAYMENT (₦)"].toString() : prev.initialPayment
        }));
        setJobData(prev => ({
          ...prev,
          jobDescription: d["JOB DESCRIPTION"] || prev.jobDescription,
          material: d.Material || prev.material,
          costPerSqft: d["COST PER SQRFT"] ? d["COST PER SQRFT"].toString() : prev.costPerSqft,
          actualWidth: d.actualWidth ? d.actualWidth.toString() : "",
          actualHeight: d.actualHeight ? d.actualHeight.toString() : "",
          rollSize: d.rollSize ? d.rollSize.toString() : prev.rollSize,
          qty: d.QTY ? d.QTY.toString() : "1"
        }));
        toast.success("Parsed successfully! Review details and Add to Order.");
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
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    const loggedBy = localStorage.getItem("userName") || "Unknown";
    
    // Sales ID is generated on the server to prevent client-side collisions.
    // Do NOT generate it here.
    
    let remainingPayment = parseFloat(batchData.initialPayment) || 0;

    const rowArrays = cart.map(item => {
      const needsInchesDivisor = item.dimensionUnit === "in";
      const sizeFormula = needsInchesDivisor 
        ? `=(${item.actualWidth}*${item.actualHeight})/144` 
        : `=(${item.actualWidth}*${item.actualHeight})`;

      let paymentForThisRow = 0;
      if (remainingPayment >= item.totalAmount) {
        paymentForThisRow = item.totalAmount;
        remainingPayment -= item.totalAmount;
      } else if (remainingPayment > 0) {
        paymentForThisRow = remainingPayment;
        remainingPayment = 0;
      }

      return [
        batchData.date, // A
        batchData.clientName, // B
        `${item.jobDescription.trim()} [${item.actualWidth}x${item.actualHeight}${item.dimensionUnit}]`, // C
        batchData.contact, // D
        item.material, // E
        item.costPerSqft, // F
        item.rollSize === "3" ? sizeFormula : "", // G
        item.rollSize === "4" ? sizeFormula : "", // H
        item.rollSize === "5" ? sizeFormula : "", // I
        item.rollSize === "6" ? sizeFormula : "", // J
        item.rollSize === "8" ? sizeFormula : "", // K
        item.rollSize === "10" ? sizeFormula : "", // L
        item.qty, // M
        `=([COL_G_L][ROW]*F[ROW])`, // N - Unit Cost formula (Dimension * Rate)
        paymentForThisRow, // O - Initial payment allocated
        `=(M[ROW]*N[ROW])`, // P - Total formula (Qty * Unit Cost)
        "", // Q
        "", // R
        `=(P[ROW]-SUM(O[ROW],Q[ROW],R[ROW]))`, // S - Balance
        `=IF(P[ROW]=0, "Unpaid", IF(S[ROW]<=0, "Paid", IF(S[ROW]<P[ROW], "Part-payment", "Unpaid")))`, // T - Payment status
        batchData.jobStatus, // U
        loggedBy, // V
        "" // W — Sales ID assigned by server
      ];
    });

    try {
      useSyncStore.getState().addPendingEntry('sale', {
        batch: true,
        items: rowArrays.map((row, i) => ({
          values: row,
          totalArea: cart[i].totalJobArea,
          // Pass the exact item name if it came from the inventory popover;
          // the server uses this for a precise inventory match instead of
          // parsing the freeform job description string.
          canonicalItemName: cart[i].fromInventory ? cart[i].jobDescription : undefined,
          jobDescription: cart[i].jobDescription,
          qty: cart[i].qty
        }))
      });
      
      toast.success("Saved locally! Syncing with Google Sheets in background...");
      setShowConfirmModal(false);
      
      setBatchData({
        date: new Date().toISOString().split("T")[0],
        clientName: "",
        contact: "",
        jobStatus: "Quoted",
        initialPayment: "0",
      });
      setJobData({
        jobDescription: "",
        material: "Flex",
        costPerSqft: "180",
        actualWidth: "",
        actualHeight: "",
        rollSize: "",
        qty: "1",
        dimensionUnit: "ft",
      });
      setCart([]);
      setNlText("");
      setRollSizeTouched(false);
      setClientNameTouched(false);
      setDimensionsTouched(false);
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
                  <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Date</Label>
                  <Input type="date" value={batchData.date} onChange={e => setBatchData({...batchData, date: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">
                    Client Name <span className="text-rose-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input 
                      placeholder="Sarah Jones" 
                      value={batchData.clientName} 
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      onChange={e => {
                        setBatchData({...batchData, clientName: e.target.value});
                        setClientNameTouched(true);
                        setShowSuggestions(true);
                      }} 
                      className={cn(
                        "h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary",
                        clientNameTouched && !batchData.clientName && "border-rose-500 ring-rose-500/10"
                      )} 
                    />
                    {showSuggestions && filteredClients.length > 0 && (
                      <div className="absolute z-50 w-full top-[calc(100%+4px)] left-0 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {filteredClients.map((client, index) => (
                          <div
                            key={index}
                            className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 cursor-pointer border-b border-gray-50 dark:border-zinc-800 last:border-0 transition-colors"
                            onClick={() => {
                              setBatchData({ 
                                ...batchData, 
                                clientName: client, 
                                contact: clientContacts[client] || "" 
                              });
                              setClientNameTouched(true);
                              setShowSuggestions(false);
                            }}
                          >
                            {client}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {clientNameTouched && !batchData.clientName && (
                    <p className="text-[11px] text-rose-500 font-black mt-1 uppercase tracking-tighter">⚠ Client name is required</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Contact Information</Label>
                  <Input placeholder="sarah.jones@email.com" value={batchData.contact} onChange={e => setBatchData({...batchData, contact: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary" />
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
                    <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Job Description</Label>
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
                                {inventory.map((item, idx) => (
                                  <CommandItem
                                    key={item["Item Name"] ? `${item["Item Name"]}-${idx}` : idx}
                                    onSelect={() => {
                                      setJobData({
                                        ...jobData,
                                        jobDescription: item["Item Name"],
                                        costPerSqft: item["Price"]?.toString() || jobData.costPerSqft,
                                        rollSize: item["Width (ft)"]?.toString() || jobData.rollSize,
                                        fromInventory: true,
                                      });
                                      setOpenInv(false);
                                      toast.info(`Selected ${item["Material Type"]}`);
                                    }}
                                    className="font-bold text-xs data-[selected=true]:bg-primary/10 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-white cursor-pointer"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        jobData.jobDescription === item["Item Name"] ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {item["Item Name"]} ({item["Width (ft)"]}ft) - ₦{parseFloat(item["Price"]).toLocaleString()}/sqft
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <Input placeholder="3x Large Format Banners for Event" value={jobData.jobDescription} onChange={e => setJobData({...jobData, jobDescription: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Material</Label>
                  <Select value={jobData.material} onValueChange={(val: string) => setJobData({...jobData, material: val})}>
                    <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl dark:bg-zinc-950 dark:border-zinc-800">
                      <SelectItem value="Flex">Flex Banner</SelectItem>
                      <SelectItem value="SAV">SAV (Sticker)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Quantity</Label>
                  <Input type="number" min="1" value={jobData.qty} onChange={e => setJobData({...jobData, qty: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950" />
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
                    <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">
                      Actual Size (Width x Height) <span className="text-rose-500">*</span>
                    </Label>
                    <div className="flex bg-gray-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-gray-200 dark:border-zinc-800">
                      <button 
                        onClick={() => setJobData({...jobData, dimensionUnit: 'ft'})}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${jobData.dimensionUnit === 'ft' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-gray-600 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300'}`}
                      >
                        FEET
                      </button>
                      <button 
                        onClick={() => setJobData({...jobData, dimensionUnit: 'in'})}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${jobData.dimensionUnit === 'in' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-gray-600 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300'}`}
                      >
                        INCHES
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                       <div className="relative flex-1 group">
                          <Input 
                            type="number" 
                            placeholder={jobData.dimensionUnit === 'ft' ? "5" : "20"} 
                            value={jobData.actualWidth} 
                            onChange={e => {
                              setJobData({...jobData, actualWidth: e.target.value});
                              setDimensionsTouched(true);
                            }} 
                            className={cn(
                              "h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 pr-10 focus:ring-primary font-bold",
                              dimensionsTouched && !jobData.actualWidth && "border-rose-500 ring-rose-500/10"
                            )} 
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary/60 uppercase">{jobData.dimensionUnit}</span>
                       </div>
                       <span className="text-gray-500 dark:text-zinc-500 font-bold text-lg flex-shrink-0">×</span>
                       <div className="relative flex-1 group">
                          <Input 
                            type="number" 
                            placeholder={jobData.dimensionUnit === 'ft' ? "3" : "15"} 
                            value={jobData.actualHeight} 
                            onChange={e => {
                              setJobData({...jobData, actualHeight: e.target.value});
                              setDimensionsTouched(true);
                            }} 
                            className={cn(
                              "h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 pr-10 focus:ring-primary font-bold",
                              dimensionsTouched && !jobData.actualHeight && "border-rose-500 ring-rose-500/10"
                            )} 
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary/60 uppercase">{jobData.dimensionUnit}</span>
                       </div>
                       {/* Inline live sqft chip */}
                       {calculatedSize > 0 && (
                         <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 h-12 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                           <span className="text-[8px] font-semibold text-primary dark:text-primary-foreground uppercase tracking-wider leading-none">= sqft</span>
                           <span className="text-sm font-black text-primary leading-none">{calculatedSize.toFixed(1)}</span>
                         </div>
                       )}
                    </div>
                    {dimensionsTouched && (!jobData.actualWidth || !jobData.actualHeight) && (
                      <p className="text-[11px] text-rose-500 font-black uppercase tracking-tighter">⚠ Width and Height are required</p>
                    )}
                  </div>
                </div>


                <div className="md:col-span-2 space-y-3">
                  <Label className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider">
                    Roll Size <span className="text-muted-foreground font-medium text-[9px]">(Width in ft)</span> <span className="text-rose-500">*</span>
                  </Label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {availableRollSizes.map((size) => {
                      return (
                        <RollCard
                          key={size}
                          width={size}
                          selected={jobData.rollSize === size}
                          onClick={() => {
                            setJobData({...jobData, rollSize: size});
                            setRollSizeTouched(true);
                          }}
                        />
                      );
                    })}
                  </div>
                  {rollSizeTouched && !jobData.rollSize && (
                    <p className="text-[11px] text-rose-500 font-black mt-1 uppercase tracking-tighter">⚠ Roll size is required</p>
                  )}
                </div>

                <div className="md:col-span-1 space-y-1.5 relative">
                  <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Cost Per SQFT (₦)</Label>
                  <Input type="number" value={jobData.costPerSqft} onChange={e => setJobData({...jobData, costPerSqft: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 font-bold" />
                </div>

                <div className="md:col-span-3 flex justify-end items-end">
                   <Button 
                     onClick={handleAddToCart}
                     className="h-12 px-6 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 text-white font-bold rounded-xl transition-all shadow-sm flex items-center gap-2"
                   >
                     <span>+ Add to Order</span>
                     {totalAmount > 0 && <span className="text-white/80 dark:text-black/80 font-normal">| ₦{totalAmount.toLocaleString()}</span>}
                   </Button>
                </div>

              </div>

              {/* Cart Section */}
              {cart.length > 0 && (
                <div className="mt-12 pt-8 border-t border-gray-100 dark:border-white/5">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Current Order</h3>
                    <Badge variant="outline" className="px-2 py-1 font-bold rounded-lg border-gray-200 dark:border-zinc-800">{cart.length} Items</Badge>
                  </div>
                  
                  <div className="space-y-3 mb-8">
                    {cart.map((item, index) => (
                      <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 dark:bg-zinc-900/50 border border-gray-100 dark:border-white/5 rounded-2xl gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white mb-0.5">{item.jobDescription || `Unnamed Job ${index + 1}`}</p>
                            <p className="text-xs font-medium text-gray-600 dark:text-zinc-300">
                              {item.qty}x {item.material} • {item.actualWidth}{item.dimensionUnit} × {item.actualHeight}{item.dimensionUnit} • {item.rollSize}FT Roll
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto ml-12 sm:ml-0">
                          <div className="text-left sm:text-right">
                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400 tracking-wider mb-0.5">Amount</p>
                            <p className="font-bold text-primary dark:text-primary-foreground">₦{item.totalAmount.toLocaleString()}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => removeFromCart(item.id)} 
                            className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 h-8 px-3 rounded-lg"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Primary Calculated Bar (Grand Total) */}
                  <div className="hidden md:flex md:col-span-4 p-5 bg-primary rounded-3xl shadow-lg shadow-primary/20 dark:shadow-none justify-between items-center gap-4 border border-white/10 mb-8">
                     <div className="flex-1 min-w-[100px]">
                        <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Total Items:</p>
                        <p className="text-xl font-bold text-primary-foreground leading-none">{cart.length}</p>
                     </div>
                     <div className="flex-1 min-w-[100px] border-l border-white/10 pl-6">
                        <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Grand Total:</p>
                        <p className="text-2xl font-bold text-primary-foreground leading-none">₦{grandTotal.toLocaleString()}</p>
                     </div>
                     <div className="flex-1 min-w-[100px] border-l border-white/10 pl-6">
                        <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Initial Paid:</p>
                        <p className="text-xl font-bold text-primary-foreground leading-none">₦{(parseFloat(batchData.initialPayment) || 0).toLocaleString()}</p>
                     </div>
                     <div className="flex-1 min-w-[100px] border-l border-white/10 pl-6">
                        <p className="text-[9px] font-bold text-primary-foreground uppercase tracking-widest mb-1 leading-none opacity-80">Balance Due:</p>
                        <p className="text-2xl font-bold text-primary-foreground leading-none">₦{amountDifference.toLocaleString()}</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mt-4">
                     <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Initial Payment (₦)</Label>
                        <Input type="number" placeholder="5000" value={batchData.initialPayment} onChange={e => setBatchData({...batchData, initialPayment: e.target.value})} className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 font-bold" />
                     </div>
                     <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-wider">Job Status</Label>
                        <Select value={batchData.jobStatus} onValueChange={(val: string) => setBatchData({...batchData, jobStatus: val})}>
                          <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 dark:bg-zinc-950 w-full shadow-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl dark:bg-zinc-950 dark:border-zinc-800">
                            <SelectItem value="Quoted">Quoted</SelectItem>
                            <SelectItem value="Printing">Printing</SelectItem>
                            <SelectItem value="Finishing">Finishing</SelectItem>
                            <SelectItem value="Ready">Ready</SelectItem>
                            <SelectItem value="Delivered">Delivered</SelectItem>
                          </SelectContent>
                        </Select>
                     </div>
                     <div className="flex flex-col items-center md:items-end">
                        <p className="text-[10px] uppercase font-bold text-gray-600 dark:text-zinc-400 tracking-widest mb-1">Status: <span className={paymentStatus === "Paid" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{paymentStatus.toUpperCase()}</span></p>
                        <Button 
                          onClick={handleReviewAndSave}
                          className="w-full h-12 text-white font-bold text-lg rounded-xl shadow-xl transition-all bg-primary hover:bg-primary/90 shadow-primary/20 dark:shadow-none hover:scale-[1.02]"
                        >
                          Review & Save Batch
                        </Button>
                     </div>
                  </div>
                </div>
              )}
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
                className="w-full p-6 bg-gray-50 dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800 rounded-3xl min-h-[220px] focus:ring-4 focus:ring-primary/10 dark:focus:ring-primary/5 focus:bg-white dark:focus:bg-zinc-900 outline-none transition-all text-xl placeholder:text-gray-300 dark:placeholder:text-zinc-700 dark:text-white font-medium" 
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
                <span className="text-[9px] font-bold uppercase tracking-widest text-primary-foreground/80">Grand Total</span>
                <span className="text-xl font-bold">₦{grandTotal.toLocaleString()}</span>
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
                  <Drawer.Title className="sr-only">Price Breakdown</Drawer.Title>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" />
                    Price Breakdown
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Detailed calculation for your current inputs.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-white/5">
                    <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-1">Total Items</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{cart.length}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-white/5">
                    <p className="text-[9px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-1">Total Area</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{cart.reduce((sum, item) => sum + item.totalJobArea, 0).toFixed(2)} sqft</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-primary/5 dark:bg-primary/20 border border-primary/10 col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[9px] font-bold text-primary dark:text-primary-foreground uppercase tracking-widest">Grand Total</p>
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                    </div>
                    <p className="text-3xl font-bold text-primary dark:text-white">₦{grandTotal.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/10 col-span-2">
                    <p className="text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1">Remaining Balance</p>
                    <p className="text-3xl font-bold text-rose-600 dark:text-white">₦{amountDifference.toLocaleString()}</p>
                  </div>
                </div>

                <Button 
                  onClick={handleReviewAndSave}
                  className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xl rounded-2xl shadow-xl shadow-primary/20"
                >
                  Review & Save Batch
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
              <div className="bg-gray-50 dark:bg-zinc-900 p-4 rounded-xl border border-gray-100 dark:border-white/5 text-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-[10px] text-gray-500 dark:text-zinc-500 uppercase font-bold">Client:</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{batchData.clientName || 'N/A'}</span>
                </div>
                <div className="space-y-2 mt-4">
                  {cart.map((item, idx) => (
                    <div key={item.id} className="flex justify-between text-xs py-2 border-t border-gray-200 dark:border-zinc-800">
                      <div className="truncate pr-4 font-medium dark:text-zinc-300">
                        {item.qty}x {item.material} ({item.rollSize}FT) - {item.jobDescription || `Item ${idx+1}`}
                      </div>
                      <div className="font-bold dark:text-white">₦{item.totalAmount.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

            <div className="flex flex-col gap-1 border-b dark:border-zinc-800 pb-2">
               <div className="flex justify-between items-center text-lg font-bold text-primary dark:text-primary-foreground mt-2">
                 <span>Grand Total</span>
                 <span>₦{grandTotal.toLocaleString()}</span>
               </div>
            </div>
            
            <div className="p-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg">
               <div className="flex justify-between items-center text-xs font-bold text-primary dark:text-primary/90">
                 <span>Initial Payment Received</span>
                 <span>₦{parseFloat(batchData.initialPayment).toLocaleString()}</span>
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
