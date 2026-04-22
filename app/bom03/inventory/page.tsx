"use client";

import { useEffect, useState } from "react";
import { 
  Package, 
  Plus, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type InventoryItem = {
  "Item Name": string;
  Category: string;
  Price: string | number; // Selling Price per Sqft
  Cost: string | number; // Total Cost of Roll
  Stock: string | number; // Total Area (Sqft) remaining
  "Waste Factor": string | number;
  "Cost per Sqft": string | number;
  _rowIndex: number;
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  // Manual Adjustment State
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  
  // New Item State
  const [newItem, setNewItem] = useState({
    name: "",
    category: "General",
    price: "", // Selling Rate per Sqft
    totalCost: "",
    rollWidth: "", // in Feet
    rollLength: "", // in Meters/Feet
    lengthUnit: "m",
    wasteFactor: "10"
  });

  const fetchInventory = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      if (res.ok) {
        setItems(json.data || []);
      } else {
        toast.error(json.error || "Failed to load inventory");
      }
    } catch (err) {
      toast.error("Network error fetching inventory");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.price || !newItem.rollWidth || !newItem.rollLength) {
      toast.error("Name, Price, and Dimensions are required");
      return;
    }

    // Convert measurements to Sqft
    const width = parseFloat(newItem.rollWidth);
    let length = parseFloat(newItem.rollLength);
    if (newItem.lengthUnit === "m") length = length * 3.28084; // Meters to Feet conversion
    
    const totalArea = width * length;
    const costPerSqft = (parseFloat(newItem.totalCost) || 0) / totalArea;

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "Item Name": newItem.name,
          Category: newItem.category,
          Price: newItem.price,
          Cost: newItem.totalCost,
          "Width (ft)": newItem.rollWidth,
          Length: newItem.rollLength,
          Unit: newItem.lengthUnit,
          Adjustments: "0",
          Stock: "=(E[ROW]*F[ROW]*IF(G[ROW]=\"m\", 3.28084, 1)) + H[ROW]",
          "Waste Factor": newItem.wasteFactor,
          "Cost per Sqft": "=D[ROW]/I[ROW]"
        })
      });

      if (res.ok) {
        toast.success("Item added to inventory!");
        setIsAddOpen(false);
        setNewItem({ 
          name: "", category: "General", price: "", totalCost: "", 
          rollWidth: "", rollLength: "", lengthUnit: "m", wasteFactor: "10" 
        });
        fetchInventory();
      } else {
        toast.error("Failed to add item");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleManualAdjustment = async () => {
    if (!adjustItem || !adjustAmount) return;
    const change = parseFloat(adjustAmount);
    if (isNaN(change)) return;

    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: adjustItem._rowIndex, stockChange: change })
      });

      if (res.ok) {
        toast.success("Stock adjusted!");
        setAdjustItem(null);
        setAdjustAmount("");
        fetchInventory();
      }
    } catch {
      toast.error("Failed to adjust stock");
    }
  };

  const filteredItems = items.filter(item => 
    item["Item Name"].toLowerCase().includes(search.toLowerCase()) ||
    item.Category.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    totalArea: items.reduce((acc, i) => acc + (parseFloat(i.Stock.toString()) || 0), 0),
    lowStock: items.filter(i => {
      const s = parseFloat(i.Stock.toString()) || 0;
      return s > 0 && s <= 50; // Low stock threshold 50 sqft
    }).length,
    outOfStock: items.filter(i => (parseFloat(i.Stock.toString()) || 0) <= 0).length,
    totalValue: items.reduce((acc, i) => acc + (parseFloat(i.Stock.toString()) * parseFloat(i.Price.toString() || "0")), 0)
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen bg-slate-50/80 dark:bg-zinc-950">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-brand-700 dark:text-brand-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-zinc-400 font-bold uppercase tracking-widest text-xs">Loading Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50/80 dark:bg-zinc-950 min-h-screen pb-32 transition-colors duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Inventory Management</h1>
            {refreshing && <RefreshCw className="w-4 h-4 text-brand-600 dark:text-brand-400 animate-spin" />}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">Track square footage and manage roll stock.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand-700 hover:bg-brand-800 text-white font-black rounded-xl h-12 px-6 shadow-lg shadow-brand-700/20 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Roll / Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
            <DialogHeader className="p-6 bg-brand-700 dark:bg-brand-800 text-white">
              <DialogTitle className="text-xl font-black">Add Inventory Roll</DialogTitle>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500">Item Name</Label>
                <Input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="e.g. SAV (Sticker)" className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500">Category</Label>
                  <Input value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500">Waste Factor (%)</Label>
                  <Input type="number" value={newItem.wasteFactor} onChange={e => setNewItem({...newItem, wasteFactor: e.target.value})} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                </div>
              </div>
              
              <div className="p-4 bg-brand-50/50 dark:bg-brand-900/20 rounded-2xl space-y-3 border border-brand-100 dark:border-brand-800/50">
                <p className="text-[10px] font-black text-brand-500 dark:text-brand-300 uppercase tracking-widest border-b border-brand-100 dark:border-brand-800/50 pb-1 mb-2">Roll Measurements</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-brand-700 dark:text-brand-400">Width (Feet)</Label>
                    <Input type="number" placeholder="e.g. 4" value={newItem.rollWidth} onChange={e => setNewItem({...newItem, rollWidth: e.target.value})} className="rounded-xl border-brand-100 dark:bg-zinc-800 dark:border-brand-900/30" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-brand-700 dark:text-brand-400">Length ({newItem.lengthUnit === 'm' ? 'Meters' : 'Feet'})</Label>
                    <div className="flex gap-1">
                      <Input type="number" placeholder="e.g. 50" value={newItem.rollLength} onChange={e => setNewItem({...newItem, rollLength: e.target.value})} className="rounded-xl border-brand-100 dark:bg-zinc-800 dark:border-brand-900/30" />
                      <Button variant="ghost" size="sm" onClick={() => setNewItem({...newItem, lengthUnit: newItem.lengthUnit === 'm' ? 'ft' : 'm'})} className="px-2 text-[8px] font-black h-10 border border-brand-100 dark:border-brand-900/30 uppercase bg-white dark:bg-zinc-800 dark:text-zinc-300">
                        {newItem.lengthUnit}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500">Selling Price (₦/sqft)</Label>
                  <Input type="number" placeholder="e.g. 200" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="rounded-xl font-bold text-brand-700 dark:text-brand-400 dark:bg-zinc-800 dark:border-zinc-700" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500">Total Buy Cost (₦)</Label>
                  <Input type="number" placeholder="e.g. 60000" value={newItem.totalCost} onChange={e => setNewItem({...newItem, totalCost: e.target.value})} className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100" />
                </div>
              </div>
            </div>
            <DialogFooter className="p-6 bg-gray-50 dark:bg-zinc-800/50 flex gap-3 border-t dark:border-zinc-800">
              <Button variant="outline" onClick={() => setIsAddOpen(false)} className="flex-1 h-12 rounded-xl font-bold dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400">Cancel</Button>
              <Button onClick={handleAddItem} className="flex-1 h-12 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-black">Add &amp; Calculate Area</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { title: "Total Area (Sqft)", val: Math.round(stats.totalArea).toLocaleString(), icon: Package, color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30" },
          { title: "Low Stock Items", val: stats.lowStock, icon: AlertTriangle, color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30" },
          { title: "Out of Stock", val: stats.outOfStock, icon: XCircle, color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/30" },
          { title: "Stock Value", val: `₦${Math.round(stats.totalValue).toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="bg-white dark:bg-zinc-900 border-none shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{stat.title}</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{stat.val}</p>
              </div>
              <div className={`p-3 rounded-2xl ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Table Area */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-gray-50 dark:border-zinc-800 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" />
            <Input 
              placeholder="Search inventory..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 bg-gray-50 dark:bg-zinc-800 border-none rounded-xl dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchInventory} className="font-bold text-gray-500 dark:text-zinc-400 hover:dark:bg-zinc-800">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50 dark:bg-zinc-800/50 border-none">
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 py-4 pl-6">Item Name</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500">Category</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500">Waste</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 text-right">Selling Rate</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 text-center">Remaining (Sqft)</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 text-center">Manual Adjust</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-gray-400 dark:text-zinc-600 font-medium italic">No inventory items found.</TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const stock = parseFloat(item.Stock.toString()) || 0;
                let status: "In Stock" | "Low Stock" | "Out of Stock" = "In Stock";
                if (stock <= 0) status = "Out of Stock";
                else if (stock <= 50) status = "Low Stock";

                const colors = {
                  "In Stock": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                  "Low Stock": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                  "Out of Stock": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                };

                return (
                  <TableRow key={item._rowIndex} className="border-b border-gray-50 dark:border-zinc-800 hover:bg-gray-50/30 dark:hover:bg-zinc-800/50">
                    <TableCell className="font-bold py-4 pl-6">
                      <div className="text-gray-900 dark:text-zinc-100">
                        {item["Item Name"]}
                        <Badge className={`ml-2 text-[8px] font-black border-none ${colors[status]}`}>
                          {status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 dark:text-zinc-500 font-medium">{item.Category}</TableCell>
                    <TableCell>
                      <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-600">{item["Waste Factor"]}%</span>
                    </TableCell>
                    <TableCell className="text-right font-black text-brand-700 dark:text-brand-400">₦{parseFloat(item.Price.toString()).toLocaleString()}/sqft</TableCell>
                    <TableCell className="text-center font-black text-gray-900 dark:text-white">{stock.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 rounded-lg border-gray-200 dark:border-zinc-700 text-[10px] font-bold dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          onClick={() => setAdjustItem(item)}
                        >
                          Adjust Waste/Stock
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!adjustItem} onOpenChange={(open) => !open && setAdjustItem(null)}>
        <DialogContent className="max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-gray-900 dark:text-white">Adjust Stock Material</DialogTitle>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Current: {parseFloat(adjustItem?.Stock?.toString() || "0").toFixed(2)} Sqft</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500 tracking-wider">Adjustment Amount (Sqft)</Label>
              <Input 
                type="number" 
                placeholder="e.g. -5 for waste, 50 for restock" 
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                className="rounded-xl h-12 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
              <p className="text-[9px] text-gray-400 dark:text-zinc-500 italic font-medium">Use negative (-) numbers to subtract stock (e.g. for damage).</p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setAdjustItem(null)} className="flex-1 rounded-xl h-11 font-bold dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400">Cancel</Button>
            <Button onClick={handleManualAdjustment} className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-black rounded-xl h-11">Apply Change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
