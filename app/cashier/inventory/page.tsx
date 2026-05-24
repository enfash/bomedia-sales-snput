"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Package, RefreshCw, Search, AlertTriangle, CheckCircle2, XCircle, Ruler, ArrowLeft, CircleDollarSign, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Material = Record<string, any>;

const parseNum = (v: any) => parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "Low Stock": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "Out of Stock": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  };
  return (
    <Badge className={cn("text-[9px] font-black border-none px-2 py-0.5", map[status] ?? map["Active"])}>
      {status}
    </Badge>
  );
}

export default function CashierInventoryPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    if (materials.length > 0) setRefreshing(true);
    try {
      const res = await fetch("/api/materials");
      const json = await res.json();
      if (res.ok) setMaterials(json.data || []);
      else toast.error(json.error || "Failed to load materials");
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return materials.filter(m =>
      (m["Material Name"] || "").toLowerCase().includes(q) ||
      (m["Material ID"] || "").toLowerCase().includes(q)
    );
  }, [materials, search]);

  const stats = useMemo(() => ({
    active: materials.filter(m => m.Status === "Active").length,
    lowStock: materials.filter(m => m.Status === "Low Stock").length,
    outOfStock: materials.filter(m => m.Status === "Out of Stock").length,
  }), [materials]);

  const financialStats = useMemo(() => {
    let totalSpent = 0;
    let totalRemainingAsset = 0;
    let totalRemainingFt = 0;

    materials.forEach(m => {
      totalSpent += parseNum(m["Total Spent"]);
      totalRemainingAsset += parseNum(m["Total Remaining Asset Value"]);
      totalRemainingFt += parseNum(m["Total Remaining (ft)"]);
    });

    return {
      totalSpent,
      totalRemainingAsset,
      totalRemainingFt
    };
  }, [materials]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Stock...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}
              className="md:hidden rounded-xl h-9 w-9 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 transition-[transform] duration-150 ease-out active:scale-[0.97]">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              Material Stock
            </h1>
            {refreshing && <RefreshCw className="w-4 h-4 text-orange-500 animate-spin" />}
          </div>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            Check available materials before logging a sale.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchData}
          disabled={refreshing}
          className="w-full md:w-auto rounded-xl h-11 px-6 font-bold"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        {/* Stock counts */}
        <div className="md:col-span-3 grid grid-cols-3 gap-4">
          {[
            { title: "Available", val: stats.active, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30" },
            { title: "Low Stock", val: stats.lowStock, icon: AlertTriangle, color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30" },
            { title: "Out of Stock", val: stats.outOfStock, icon: XCircle, color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/30" },
          ].map((s) => (
            <Card key={s.title} className="bg-white dark:bg-zinc-900 border-none shadow-sm">
              <CardContent className="p-4 flex items-center justify-between h-full">
                <div>
                  <p className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-1">{s.title}</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{s.val}</p>
                </div>
                <div className={`p-3 rounded-2xl ${s.color} hidden sm:block`}><s.icon className="w-5 h-5" /></div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Valuation summary */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          {[
            { 
              title: "Total Spent", 
              val: `₦${financialStats.totalSpent.toLocaleString()}`, 
              icon: CircleDollarSign, 
              color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30",
              sub: "Total Spent on Inventory"
            },
            { 
              title: "Est. Remaining Value", 
              val: `₦${financialStats.totalRemainingAsset.toLocaleString()}`, 
              icon: TrendingUp, 
              color: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30",
              sub: `${financialStats.totalRemainingFt.toFixed(1)} ft remaining`
            },
          ].map((s) => (
            <Card key={s.title} className="bg-white dark:bg-zinc-900 border-none shadow-sm">
              <CardContent className="p-4 flex items-center justify-between h-full">
                <div>
                  <p className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-1">{s.title}</p>
                  <p className="text-lg sm:text-xl font-black text-gray-900 dark:text-white leading-tight">{s.val}</p>
                  <p className="text-[9px] text-gray-400 dark:text-zinc-500 font-bold uppercase mt-1 tracking-wider leading-none">{s.sub}</p>
                </div>
                <div className={`p-3 rounded-2xl ${s.color} hidden sm:block`}><s.icon className="w-5 h-5" /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search by material name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 h-11 rounded-xl bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800"
        />
      </div>

      {/* Materials grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
            <Package className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-bold">No materials found.</p>
          </div>
        ) : filtered.map(mat => {
          const remaining = parseNum(mat["Total Remaining (ft)"]);
          const capacity  = parseNum(mat["Total Capacity (ft)"]);
          const pct = capacity > 0 ? Math.min(100, (remaining / capacity) * 100) : 0;
          const barColor =
            mat.Status === "Out of Stock" ? "bg-rose-500" :
            mat.Status === "Low Stock"    ? "bg-amber-500" : "bg-emerald-500";
          const spent = parseNum(mat["Total Spent"]);
          const remAsset = parseNum(mat["Total Remaining Asset Value"]);

          return (
            <Card
              key={mat["Material ID"]}
              className={cn(
                "bg-white dark:bg-zinc-900 border-2 shadow-sm transition-[border-color,opacity]",
                mat.Status === "Out of Stock"
                  ? "border-rose-100 dark:border-rose-900/30 opacity-70"
                  : mat.Status === "Low Stock"
                  ? "border-amber-100 dark:border-amber-900/30"
                  : "border-transparent"
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-black text-gray-900 dark:text-white text-sm">
                      {mat["Material Name"]}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-mono mt-0.5">
                      {mat["Material ID"]}
                    </p>
                  </div>
                  <StatusPill status={mat.Status || "Active"} />
                </div>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    <Ruler className="w-3 h-3" />
                    {parseNum(mat["Width (ft)"])}ft wide
                  </span>
                  <span className="text-sm font-black text-gray-900 dark:text-white">
                    {remaining.toFixed(1)}ft left
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full [transition:width_500ms_ease-out]", barColor)}
                    style={{ width: `${pct.toFixed(1)}%` }}
                  />
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-zinc-800 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-gray-400 dark:text-zinc-500 block uppercase tracking-wider font-bold text-[9px]">Spent</span>
                    <span className="font-extrabold text-gray-700 dark:text-zinc-300">₦{spent.toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 dark:text-zinc-500 block uppercase tracking-wider font-bold text-[9px]">Remaining Value</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">₦{remAsset.toLocaleString()}</span>
                  </div>
                </div>

                {mat.Status === "Low Stock" && (
                  <p className="mt-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Running low — inform admin
                  </p>
                )}
                {mat.Status === "Out of Stock" && (
                  <p className="mt-2 text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Not available
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
