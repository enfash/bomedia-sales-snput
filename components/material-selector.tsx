"use client";

import { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Package, Layers, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "vaul";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseNum = (v: string | number | undefined) =>
  parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

export function MaterialSelector({
  materials,
  selectedMaterialId,
  onSelect,
  loading,
}: {
  materials: any[];
  selectedMaterialId: string;
  onSelect: (material: any) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return materials.filter(
      (m) =>
        (m["Material ID"] || "").toLowerCase().includes(q) ||
        (m["Material Name"] || "").toLowerCase().includes(q)
    );
  }, [materials, search]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.forEach((m) => {
      const key = m["Material Name"] || "Other";
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [filtered]);

  const selected = materials.find((m) => m["Material ID"] === selectedMaterialId);

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase font-black text-gray-500 dark:text-zinc-400 tracking-wider flex items-center gap-1.5">
        <Package className="w-3 h-3" />
        Select Material *
      </Label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full h-14 rounded-2xl border-2 px-4 flex items-center justify-between transition-[border-color,background-color] text-left",
          selectedMaterialId
            ? "border-primary bg-primary/5 dark:bg-primary/10 dark:border-primary/70"
            : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-primary/50 dark:hover:border-primary/50"
        )}
      >
        {selected ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                {selected["Material ID"]}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-zinc-400 font-medium">
                {parseNum(selected["Width (ft)"])}ft wide · ₦{parseNum(selected["Selling Price"]).toLocaleString()}/sqft
              </p>
            </div>
          </div>
        ) : (
          <span className="text-gray-400 dark:text-zinc-600 font-medium text-sm">
            {loading ? "Loading materials…" : "Tap to choose material…"}
          </span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
      </button>

      {/* Roll picker bottom sheet / dialog */}
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
          <Drawer.Content className="bg-white dark:bg-zinc-950 flex flex-col rounded-t-[2.5rem] fixed bottom-0 left-0 right-0 z-50 outline-none shadow-2xl border-t dark:border-zinc-800 max-h-[88vh]">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 mt-4" />

            <div className="px-5 pt-4 pb-2 border-b dark:border-zinc-800">
              <Drawer.Title className="text-lg font-black text-gray-900 dark:text-white mb-3">
                Choose a Material
              </Drawer.Title>
              <Drawer.Description className="sr-only">
                Select a material profile for this job
              </Drawer.Description>
              <Input
                placeholder="Search materials…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-700"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-5">
              {Object.entries(grouped).map(([materialName, options]) => (
                <div key={materialName}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2 px-1">
                    {materialName}
                  </p>
                  <div className="space-y-2">
                    {options.map((mat) => {
                      const remaining = parseNum(mat["Total Remaining (ft)"]);
                      const capacity = parseNum(mat["Total Capacity (ft)"]);
                      const pct = capacity > 0 ? Math.min(100, (remaining / capacity) * 100) : 0;
                      const isOut = remaining <= 0 || mat.Status === "Out of Stock";

                      return (
                        <button
                          key={mat["Material ID"]}
                          type="button"
                          disabled={isOut}
                          onClick={() => {
                            onSelect(mat);
                            setOpen(false);
                            setSearch("");
                          }}
                          className={cn(
                            "w-full p-4 rounded-2xl border-2 text-left transition-[border-color,background-color]",
                            mat["Material ID"] === selectedMaterialId
                              ? "border-primary bg-primary/5 dark:bg-primary/10"
                              : isOut
                              ? "border-gray-100 dark:border-zinc-800 opacity-40 cursor-not-allowed"
                              : "border-gray-100 dark:border-zinc-800 hover:border-primary/50 dark:hover:border-primary/50 bg-white dark:bg-zinc-900"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-black text-gray-900 dark:text-white">
                                {mat["Material ID"]}
                              </p>
                              <p className="text-[10px] text-gray-500 dark:text-zinc-400 font-medium mt-0.5">
                                {parseNum(mat["Width (ft)"])}ft wide · ₦{parseNum(mat["Selling Price"]).toLocaleString()}/sqft
                              </p>
                            </div>
                            <div className="text-right">
                              <span className={cn(
                                "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                                mat.Status === "Low Stock" ? "bg-amber-100 text-amber-600" : isOut ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                              )}>
                                {remaining.toFixed(0)}ft left
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full [transition:width_300ms_ease-out]",
                                mat.Status === "Low Stock" ? "bg-amber-500" : isOut ? "bg-rose-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No materials found</p>
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
