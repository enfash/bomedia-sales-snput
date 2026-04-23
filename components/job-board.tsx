"use client";

import { UnifiedRecord } from "@/components/manage-sale-action";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MaterialBadge } from "@/components/material-badge";
import { Clock, CheckCircle2, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, "");
  return parseFloat(str) || 0;
};

const mapSale = (r: any): UnifiedRecord => {
  const amount = parseAmount(r["AMOUNT (₦)"] || r["Amount (₦)"]);
  return {
    id: `sale-${r.DATE}-${r["CLIENT NAME"]}-${Math.random()}`,
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
    raw: r
  };
};

const COLUMNS = [
  { id: "Quoted", label: "Quoted / Pending", color: "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300", accent: "border-gray-300 dark:border-zinc-600" },
  { id: "Printing", label: "Printing", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", accent: "border-amber-400 dark:border-amber-500" },
  { id: "Finishing", label: "Finishing / In Progress", color: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400", accent: "border-sky-400 dark:border-sky-500" },
  { id: "Ready", label: "Ready", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", accent: "border-emerald-400 dark:border-emerald-500" },
  { id: "Delivered", label: "Delivered / Completed", color: "bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300", accent: "border-brand-400 dark:border-brand-500" },
];

const getColumnId = (status: string) => {
  if (status === "Pending" || status === "Quoted") return "Quoted";
  if (status === "In Progress" || status === "Finishing") return "Finishing";
  if (status === "Completed" || status === "Delivered") return "Delivered";
  if (status === "Ready") return "Ready";
  if (status === "Printing") return "Printing";
  return "Quoted"; // fallback
};

export function JobBoard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [isUpdating, setIsUpdating] = useState<number | null>(null);
  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/sales");
      const json = await res.json();
      const mapped = (json.data || []).map((r: any) => mapSale(r));
      setRecords(mapped);
    } catch (e) {
      console.error("Failed to fetch sales for board");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleNextStage = async (record: UnifiedRecord) => {
    if (!record.rowIndex) return;
    
    const currentId = getColumnId(record.jobStatus || "Quoted");
    const currentIndex = COLUMNS.findIndex(c => c.id === currentId);
    
    if (currentIndex < COLUMNS.length - 1) {
      const nextStatus = COLUMNS[currentIndex + 1].id;
      setIsUpdating(record.rowIndex);
      
      try {
        await fetch("/api/sales", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowIndex: record.rowIndex,
            jobStatus: nextStatus
          })
        });
        
        fetchRecords(); // Refresh the board after updating
      } catch (error) {
        console.error("Failed to update status", error);
      } finally {
        setIsUpdating(null);
      }
    }
  };

  const boardData = COLUMNS.map(col => ({
    ...col,
    items: records.filter(r => r.type === "Sale" && getColumnId(r.jobStatus || "Quoted") === col.id)
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-medium text-sm">Loading job board...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
         <Button variant="outline" size="sm" onClick={fetchRecords} disabled={isLoading} className="h-9">
           <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
           Refresh Board
         </Button>
      </div>
      <div className="flex h-full min-h-[calc(100vh-14rem)] gap-4 overflow-x-auto pb-4 snap-x">
      {boardData.map((column) => (
        <div key={column.id} className="flex-none w-[320px] flex flex-col bg-gray-50/50 dark:bg-zinc-900/20 rounded-2xl border border-gray-100 dark:border-zinc-800/50 snap-start h-full max-h-[calc(100vh-10rem)]">
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
            {column.items.map((job) => (
              <Card key={job.rowIndex} className="p-3 shadow-sm border-gray-200 dark:border-zinc-800 hover:shadow-md transition-shadow relative group">
                <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-lg", column.color.split(" ")[0])} />
                
                <div className="flex justify-between items-start mb-2 pl-2">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium truncate">{job.client}</p>
                    <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 leading-tight line-clamp-2 mt-0.5">
                      {job.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pl-2 mb-3">
                  {job.material && <MaterialBadge material={job.material} />}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-zinc-800 pl-2">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{job.date?.split(',')[0]}</span>
                  </div>
                  
                  {column.id !== "Delivered" && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-xs font-semibold hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20"
                      onClick={() => handleNextStage(job)}
                    >
                      Next <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                  {column.id === "Delivered" && (
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Done
                    </div>
                  )}
                </div>
              </Card>
            ))}
            
            {column.items.length === 0 && (
              <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-xl">
                <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium">No jobs in {column.label}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
