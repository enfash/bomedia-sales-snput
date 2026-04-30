"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Ruler,
  Package,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type InventoryItem = {
  "Item Name": string;
  "Width (ft)": string | number;
  "Length": string | number;
  "Unit": string;
  "Price": string | number;
  "Stock": string | number;
  _rowIndex: number;
};

export default function QuickCheckPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Form inputs
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [lengthUnit, setLengthUnit] = useState<"m" | "ft">("ft");
  const [wasteFactor, setWasteFactor] = useState("10");

  const fetchInventory = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      if (res.ok) {
        const data = json.data || [];
        setItems(data);
        if (data.length > 0 && !selectedItem) {
          setSelectedItem(data[0]);
        }
      } else {
        toast.error("Failed to load materials");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleSelectMaterial = (rowIndexStr: string) => {
    const item = items.find(i => i._rowIndex.toString() === rowIndexStr) || null;
    setSelectedItem(item);
  };

  // Calculations
  const parsedWidth = parseFloat(width) || 0;
  const parsedLength = parseFloat(length) || 0;
  const parsedWaste = parseFloat(wasteFactor) || 0;
  
  // Conversion
  const lengthInFeet = lengthUnit === "m" ? parsedLength * 3.28084 : parsedLength;
  const requestedArea = parsedWidth * lengthInFeet;
  const wasteArea = requestedArea * (parsedWaste / 100);
  const totalRequiredArea = requestedArea + wasteArea;

  // Fulfillment parameters for the SELECTED roll
  const rollWidth = parseFloat(selectedItem?.["Width (ft)"]?.toString() || "0") || 0;
  const rollStock = parseFloat(selectedItem?.["Stock"]?.toString() || "0") || 0;

  const widthOk = rollWidth >= parsedWidth;
  const stockOk = rollStock >= totalRequiredArea;
  const netStockOk = rollStock >= requestedArea;

  const isFulfilled = widthOk && stockOk;
  const canFulfillNet = widthOk && netStockOk;

  // List alternative rolls that CAN fulfill dimensions
  const alternativeFulfillments = items.filter(item => {
    const rWidth = parseFloat(item["Width (ft)"]?.toString() || "0") || 0;
    const rStock = parseFloat(item["Stock"]?.toString() || "0") || 0;
    return rWidth >= parsedWidth && rStock >= totalRequiredArea && item._rowIndex !== selectedItem?._rowIndex;
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen bg-orange-50/20 dark:bg-zinc-950 transition-colors duration-500">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-orange-600 dark:text-orange-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-zinc-400 font-black uppercase tracking-widest text-xs">Loading inventory nodes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-orange-50/20 dark:bg-zinc-950 min-h-screen pb-32 transition-colors duration-500">
      <div className="max-w-2xl mx-auto">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link href="/cashier">
              <Button variant="ghost" size="icon" className="rounded-full bg-white dark:bg-zinc-900 shadow-sm border border-gray-100 dark:border-zinc-800">
                <ArrowLeft className="w-4 h-4 text-gray-700 dark:text-zinc-300" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Quick-Check</h1>
                {refreshing && <RefreshCw className="w-3 h-3 text-orange-600 dark:text-orange-400 animate-spin" />}
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Evaluate physical inventory roll capacities.</p>
            </div>
          </div>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={fetchInventory} 
            disabled={refreshing}
            className="rounded-full bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 dark:text-zinc-300 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Input Panel */}
          <Card className="bg-white dark:bg-zinc-900 border-none shadow-lg rounded-[2rem] overflow-hidden p-6">
            <CardContent className="p-0 space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-gray-400 dark:text-zinc-500 tracking-widest" htmlFor="material-select">
                  Select Target Material Roll
                </Label>
                <select
                  id="material-select"
                  value={selectedItem?._rowIndex.toString() || ""}
                  onChange={(e) => handleSelectMaterial(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all shadow-inner"
                >
                  {items.map((item) => (
                    <option key={item._rowIndex} value={item._rowIndex.toString()}>
                      {item["Item Name"]} | {parseFloat(item["Width (ft)"]?.toString() || "0").toFixed(1)}ft Width ({parseFloat(item["Stock"]?.toString() || "0").toFixed(0)} sqft)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase text-gray-400 dark:text-zinc-500 tracking-widest" htmlFor="width-input">
                    Print Job Width (Ft)
                  </Label>
                  <div className="relative">
                    <Input
                      id="width-input"
                      type="number"
                      placeholder="e.g. 4"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="h-12 rounded-2xl font-bold dark:bg-zinc-800/50 dark:border-zinc-800 dark:text-zinc-100 shadow-inner pl-10 focus-visible:ring-orange-500"
                    />
                    <Ruler className="w-4 h-4 text-gray-400 absolute left-4 top-4" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase text-gray-400 dark:text-zinc-500 tracking-widest" htmlFor="length-input">
                    Print Job Length
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="length-input"
                      type="number"
                      placeholder="e.g. 10"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      className="h-12 rounded-2xl font-bold dark:bg-zinc-800/50 dark:border-zinc-800 dark:text-zinc-100 shadow-inner flex-1 focus-visible:ring-orange-500"
                    />
                    <Button
                      variant="ghost"
                      onClick={() => setLengthUnit(lengthUnit === "m" ? "ft" : "m")}
                      className="h-12 px-4 font-black uppercase border border-gray-100 dark:border-zinc-800 rounded-2xl bg-gray-50 dark:bg-zinc-800/50 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 shadow-sm"
                    >
                      {lengthUnit}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-gray-400 dark:text-zinc-500 tracking-widest" htmlFor="waste-input">
                  Waste Safety Buffer (%)
                </Label>
                <Input
                  id="waste-input"
                  type="number"
                  value={wasteFactor}
                  onChange={(e) => setWasteFactor(e.target.value)}
                  className="h-12 rounded-2xl font-bold dark:bg-zinc-800/50 dark:border-zinc-800 dark:text-zinc-100 shadow-inner focus-visible:ring-orange-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* Selected Results Card */}
          {parsedWidth > 0 && parsedLength > 0 && selectedItem && (
            <Card className={`border-none shadow-2xl rounded-[2rem] overflow-hidden transition-all duration-500 bg-gradient-to-br ${
              isFulfilled 
                ? "from-emerald-500 to-emerald-600 text-white" 
                : canFulfillNet 
                  ? "from-amber-500 to-amber-600 text-white"
                  : "from-rose-500 to-rose-600 text-white"
            }`}>
              <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-white/20 rounded-2xl shadow-inner">
                    {isFulfilled ? (
                      <CheckCircle2 className="w-10 h-10 text-white animate-pulse" />
                    ) : canFulfillNet ? (
                      <AlertTriangle className="w-10 h-10 text-white animate-bounce" />
                    ) : (
                      <XCircle className="w-10 h-10 text-white" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight leading-none">
                      {isFulfilled 
                        ? "Fulfillment Guaranteed" 
                        : canFulfillNet 
                          ? "Width Matches, Tight Margin" 
                          : !widthOk 
                            ? "Roll Too Narrow" 
                            : "Insufficient Material Area"}
                    </h2>
                    <p className="text-xs mt-2 text-white/80 font-medium max-w-xs">
                      {!widthOk 
                        ? `Job requires ${parsedWidth}ft but roll width is only ${rollWidth}ft.`
                        : isFulfilled 
                          ? "Roll satisfies print size and waste coverage." 
                          : "Meets square foot totals but exceeds safety boundaries."}
                    </p>
                  </div>
                </div>

                <div className="text-center md:text-right shrink-0 bg-white/10 p-4 rounded-2xl border border-white/10 min-w-[150px] shadow-inner">
                  <p className="text-[10px] font-black uppercase tracking-wider text-white/70">Required Sqft</p>
                  <p className="text-3xl font-black tracking-tight leading-tight">{totalRequiredArea.toFixed(1)}</p>
                  <p className="text-[10px] font-bold text-white/80 mt-1">Out of {rollStock.toFixed(0)} left</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Alternatives list */}
          {parsedWidth > 0 && parsedLength > 0 && alternativeFulfillments.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 dark:text-zinc-500 flex items-center gap-2 px-1">
                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                Alternative Fulfilling Rolls
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {alternativeFulfillments.map((alt) => (
                  <Card key={alt._rowIndex} className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/60 shadow-sm rounded-2xl p-4 flex items-center justify-between transition-all duration-300 hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-50 dark:bg-zinc-800 rounded-xl text-orange-600 dark:text-orange-400">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white">{alt["Item Name"]}</h4>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Width: {parseFloat(alt["Width (ft)"].toString()).toFixed(1)}ft</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-100 dark:border-emerald-900">
                        {parseFloat(alt["Stock"].toString()).toFixed(0)} sqft
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
