"use client";

import { UnifiedRecord } from "@/components/manage-sale-action";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MaterialBadge } from "@/components/material-badge";
import { Clock, CheckCircle2, RefreshCw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncStore } from "@/lib/store";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

const mapSale = (r: any): UnifiedRecord => {
  const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
  return {
    id: r["Sales ID"] || r["SALES ID"] || `sale-${r.DATE}-${r["CLIENT NAME"]}-${Math.random()}`,
    date: r.DATE || r.Date || "N/A",
    type: "Sale",
    client: r["CLIENT NAME"] || r["Client Name"] || "N/A",
    description: r["JOB DESCRIPTION"] || r["Job Description"] || "—",
    amount,
    status: "In Progress",
    loggedBy: r["Logged By"] || "Unknown",
    isPending: false,
    rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
    jobStatus: r["JOB STATUS"] || r["Job Status"] || "Quoted",
    material: r["Material"] || r["MATERIAL"] || r["material"] || "",
    balance: parseAmount(r["AMOUNT DIFFERENCES"] || r["Amount Differences"]),
    salesId: r["Sales ID"] || r["SALES ID"],
    raw: r
  };
};

const COLUMNS = [
  { id: "Quoted", label: "Quoted / Pending", color: "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300", accent: "border-gray-300 dark:border-zinc-600" },
  { id: "Printing", label: "Printing", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", accent: "border-amber-400 dark:border-amber-500" },
  { id: "Finishing", label: "Finishing / In Progress", color: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400", accent: "border-sky-400 dark:border-sky-500" },
  { id: "Ready", label: "Ready", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", accent: "border-emerald-400 dark:border-emerald-500" },
  { id: "Delivered", label: "Delivered / Completed", color: "bg-primary/10 dark:bg-primary/20 text-primary", accent: "border-primary/50 dark:border-primary/40" },
];

const getColumnId = (status: string) => {
  if (status === "Pending" || status === "Quoted") return "Quoted";
  if (status === "In Progress" || status === "Finishing") return "Finishing";
  if (status === "Completed" || status === "Delivered") return "Delivered";
  if (status === "Ready") return "Ready";
  if (status === "Printing") return "Printing";
  return "Quoted"; // fallback
};

interface JobBoardProps {
  isAdmin?: boolean;
  filterClient?: string | null;
}

export function JobBoard({ isAdmin = false, filterClient }: JobBoardProps) {
  const { cachedSales, updateSaleStatus } = useSyncStore();
  const [draggedJob, setDraggedJob] = useState<UnifiedRecord | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const records = useMemo(() => {
    let mapped = (cachedSales || []).map((r: any) => mapSale(r));
    if (filterClient) {
      mapped = mapped.filter((r: UnifiedRecord) => 
        r.client.toLowerCase().includes(filterClient.toLowerCase())
      );
    }
    return mapped;
  }, [cachedSales, filterClient]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/sales");
      const json = await res.json();
      const store = useSyncStore.getState();
      store.setCachedData(json.data || [], store.cachedExpenses, store.cachedInventory, store.cachedPayments, store.cachedMaterials);
    } catch (error) {
      console.error("Failed to refresh board");
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleSelection = (jobId: string) => {
    setSelectedJobIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    if (!draggedJob) return;

    const currentId = getColumnId(draggedJob.jobStatus || "Quoted");
    if (currentId !== targetStatus) {
      // If the dragged item is part of the selection, move all selected items
      if (selectedJobIds.has(draggedJob.id)) {
        const jobsToMove = records.filter(r => selectedJobIds.has(r.id));
        jobsToMove.forEach(job => {
          const jobCurrentId = getColumnId(job.jobStatus || "Quoted");
          if (jobCurrentId !== targetStatus) {
            updateSaleStatus(job.salesId || "", job.rowIndex, targetStatus);
          }
        });
        setSelectedJobIds(new Set()); // clear selection after mass move
      } else {
        // Move only the single dragged item
        updateSaleStatus(draggedJob.salesId || "", draggedJob.rowIndex, targetStatus);
      }
    }
    setDraggedJob(null);
  };

  const boardData = COLUMNS.map(col => ({
    ...col,
    items: records.filter(r => r.type === "Sale" && getColumnId(r.jobStatus || "Quoted") === col.id)
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between min-h-[36px]">
         <div className="flex items-center">
           {selectedJobIds.size > 0 && (
             <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-300">
               <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 text-sm py-1 font-bold">
                 {selectedJobIds.size} selected
               </Badge>
               <Button 
                 variant="ghost" 
                 size="sm" 
                 onClick={() => setSelectedJobIds(new Set())}
                 className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-zinc-100 h-8 px-2"
               >
                 <X className="w-3.5 h-3.5 mr-1" />
                 Clear
               </Button>
               <span className="text-xs font-medium text-gray-400">Drag any selected card to move all</span>
             </div>
           )}
         </div>
         <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="h-9 shrink-0">
           <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
           Refresh Board
         </Button>
      </div>
      
      <div className="flex h-full min-h-[calc(100vh-14rem)] gap-4 overflow-x-auto pb-4 snap-x">
      {boardData.map((column) => (
        <div 
          key={column.id} 
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, column.id)}
          className="flex-none w-[320px] flex flex-col bg-gray-50/50 dark:bg-zinc-900/20 rounded-2xl border border-gray-100 dark:border-zinc-800/50 snap-start h-full max-h-[calc(100vh-10rem)] transition-colors"
        >
          {/* Column Header */}
          <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-gray-50/95 dark:bg-zinc-900/95 backdrop-blur z-10 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full border-2", column.accent, column.color.split(" ")[0])} />
              <h3 className="font-bold text-gray-800 dark:text-zinc-100">{column.label}</h3>
            </div>
            <Badge variant="secondary" className="bg-white dark:bg-zinc-800 text-xs font-bold tabular-nums">
              {column.items.length}
            </Badge>
          </div>

          {/* Column Body */}
          <div className="p-3 flex-1 overflow-y-auto space-y-3">
            {column.items.map((job) => {
              const isSelected = selectedJobIds.has(job.id);
              const isDraggingSelected = draggedJob && selectedJobIds.has(draggedJob.id) && isSelected;
              const isDraggingThis = draggedJob?.id === job.id;
              
              return (
                <Card 
                  key={job.id} 
                  draggable
                  onClick={() => toggleSelection(job.id)}
                  onDragStart={() => setDraggedJob(job)}
                  onDragEnd={() => setDraggedJob(null)}
                  className={cn(
                    "p-3 transition-all relative group cursor-grab active:cursor-grabbing",
                    isSelected 
                      ? "ring-2 ring-primary bg-primary/5 dark:bg-primary/10 border-primary shadow-md" 
                      : "shadow-sm border-gray-200 dark:border-zinc-800 hover:shadow-md hover:border-gray-300 dark:hover:border-zinc-700",
                    (isDraggingThis || isDraggingSelected) ? "opacity-50 scale-95" : "opacity-100"
                  )}
                >
                  <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-lg", column.color.split(" ")[0])} />
                  
                  {isSelected && (
                    <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center shadow-sm z-10">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-2 pl-2">
                    <div className="min-w-0 pr-2 pointer-events-none">
                      <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium truncate">{job.client}</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 leading-tight line-clamp-2 mt-0.5">
                        {job.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pl-2 mb-3 pointer-events-none">
                    {job.material && <MaterialBadge material={job.material} />}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-zinc-800 pl-2 pointer-events-none">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{job.date?.split(',')[0]}</span>
                    </div>
                    
                    {column.id === "Delivered" && (
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Done
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
            
            {column.items.length === 0 && (
              <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-xl">
                <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium">Drop jobs here</p>
              </div>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
