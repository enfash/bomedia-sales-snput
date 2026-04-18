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
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-[#f8fafc] min-h-screen pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Inventory Management</h1>
            {refreshing && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
          </div>
          <p className="text-gray-500 text-sm mt-1">Track square footage and manage roll stock.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl h-12 px-6 shadow-lg shadow-indigo-100 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Roll / Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-white rounded-3xl p-0 overflow-hidden border-none">
            <DialogHeader className="p-6 bg-indigo-600 text-white">
              <DialogTitle className="text-xl font-black">Add Inventory Roll</DialogTitle>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-black text-gray-400">Item Name</Label>
                <Input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="e.g. SAV (Sticker)" className="rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400">Category</Label>
                  <Input value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400">Waste Factor (%)</Label>
                  <Input type="number" value={newItem.wasteFactor} onChange={e => setNewItem({...newItem, wasteFactor: e.target.value})} className="rounded-xl" />
                </div>
              </div>
              
              <div className="p-4 bg-indigo-50/50 rounded-2xl space-y-3 border border-indigo-100">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest border-b border-indigo-100 pb-1 mb-2">Roll Measurements</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-indigo-600">Width (Feet)</Label>
                    <Input type="number" placeholder="e.g. 4" value={newItem.rollWidth} onChange={e => setNewItem({...newItem, rollWidth: e.target.value})} className="rounded-xl border-indigo-100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-indigo-600">Length ({newItem.lengthUnit === 'm' ? 'Meters' : 'Feet'})</Label>
                    <div className="flex gap-1">
                      <Input type="number" placeholder="e.g. 50" value={newItem.rollLength} onChange={e => setNewItem({...newItem, rollLength: e.target.value})} className="rounded-xl border-indigo-100" />
                      <Button variant="ghost" size="sm" onClick={() => setNewItem({...newItem, lengthUnit: newItem.lengthUnit === 'm' ? 'ft' : 'm'})} className="px-2 text-[8px] font-black h-10 border border-indigo-100 uppercase bg-white">
                        {newItem.lengthUnit}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400">Selling Price (₦/sqft)</Label>
                  <Input type="number" placeholder="e.g. 200" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="rounded-xl font-bold text-indigo-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-black text-gray-400">Total Buy Cost (₦)</Label>
                  <Input type="number" placeholder="e.g. 60000" value={newItem.totalCost} onChange={e => setNewItem({...newItem, totalCost: e.target.value})} className="rounded-xl" />
                </div>
              </div>
            </div>
            <DialogFooter className="p-6 bg-gray-50 flex gap-3">
              <Button variant="outline" onClick={() => setIsAddOpen(false)} className="flex-1 h-12 rounded-xl font-bold">Cancel</Button>
              <Button onClick={handleAddItem} className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black">Add & Calculate Area</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { title: "Total Area (Sqft)", val: Math.round(stats.totalArea).toLocaleString(), icon: Package, color: "text-blue-600 bg-blue-50" },
          { title: "Low Stock Items", val: stats.lowStock, icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
          { title: "Out of Stock", val: stats.outOfStock, icon: XCircle, color: "text-rose-600 bg-rose-50" },
          { title: "Stock Value", val: `₦${Math.round(stats.totalValue).toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
        ].map((stat, i) => (
          <Card key={i} className="bg-white border-none shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.title}</p>
                <p className="text-2xl font-black text-gray-900">{stat.val}</p>
              </div>
              <div className={`p-3 rounded-2xl ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Table Area */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Search inventory..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 bg-gray-50 border-none rounded-xl"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchInventory} className="font-bold text-gray-500">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50 border-none">
              <TableHead className="text-[10px] font-black uppercase text-gray-400 py-4 pl-6">Item Name</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400">Category</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400">Waste</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 text-right">Selling Rate</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 text-center">Remaining (Sqft)</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-gray-400 text-center">Manual Adjust</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-gray-400 italic">No inventory items found.</TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const stock = parseFloat(item.Stock.toString()) || 0;
                let status: "In Stock" | "Low Stock" | "Out of Stock" = "In Stock";
                if (stock <= 0) status = "Out of Stock";
                else if (stock <= 50) status = "Low Stock";

                const colors = {
                  "In Stock": "bg-emerald-100 text-emerald-700",
                  "Low Stock": "bg-amber-100 text-amber-700",
                  "Out of Stock": "bg-rose-100 text-rose-700"
                };

                return (
                  <TableRow key={item._rowIndex} className="border-b border-gray-50 hover:bg-gray-50/30">
                    <TableCell className="font-bold py-4 pl-6">
                      <div>
                        {item["Item Name"]}
                        <Badge className={`ml-2 text-[8px] font-black border-none ${colors[status]}`}>
                          {status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 font-medium">{item.Category}</TableCell>
                    <TableCell>
                      <span className="text-[10px] font-bold text-gray-400">{item["Waste Factor"]}%</span>
                    </TableCell>
                    <TableCell className="text-right font-black text-indigo-600">₦{parseFloat(item.Price.toString()).toLocaleString()}/sqft</TableCell>
                    <TableCell className="text-center font-black text-gray-900">{stock.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 rounded-lg border-gray-200 text-[10px] font-bold"
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
        <DialogContent className="max-w-sm bg-white rounded-3xl p-6 border-none">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-gray-900">Adjust Stock Material</DialogTitle>
            <p className="text-xs text-gray-500">Current: {parseFloat(adjustItem?.Stock?.toString() || "0").toFixed(2)} Sqft</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Adjustment Amount (Sqft)</Label>
              <Input 
                type="number" 
                placeholder="e.g. -5 for waste, 50 for restock" 
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                className="rounded-xl h-12"
              />
              <p className="text-[9px] text-gray-400 italic font-medium">Use negative (-) numbers to subtract stock (e.g. for damage).</p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setAdjustItem(null)} className="flex-1 rounded-xl h-11 font-bold">Cancel</Button>
            <Button onClick={handleManualAdjustment} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl h-11">Apply Change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
