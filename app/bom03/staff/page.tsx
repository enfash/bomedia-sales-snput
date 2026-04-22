"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Trash2, PowerOff, UserPlus, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Cashier = {
  _rowIndex?: number;
  Name: string;
  Status: string;
  'Last Login': string;
};

export default function StaffManagerPage() {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCashierName, setNewCashierName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchCashiers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/cashiers");
      const { data, error } = await res.json();
      if (error) {
        toast.error("Failed to fetch cashiers: " + error);
        return;
      }
      setCashiers(data || []);
    } catch (err) {
      toast.error("Network error fetching cashiers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashiers();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCashierName.trim()) return;

    setIsAdding(true);
    try {
      const res = await fetch("/api/cashiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCashierName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Cashier added successfully!");
      setNewCashierName("");
      setDialogOpen(false);
      fetchCashiers();
    } catch (err: any) {
      toast.error(err.message || "Failed to add cashier");
    } finally {
      setIsAdding(false);
    }
  };

  const handleForceLogOut = async (name: string) => {
    try {
      const res = await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, status: "Offline" }),
      });
      if (res.ok) {
        toast.success(`${name} was forcefully disconnected.`);
        fetchCashiers();
      } else {
        const data = await res.json();
        toast.error(data.error);
      }
    } catch {
      toast.error("Failed to disconnect cashier.");
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to permanently delete ${name}?`)) return;
    try {
      const res = await fetch("/api/cashiers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        toast.success(`${name} was deleted.`);
        fetchCashiers();
      } else {
        const data = await res.json();
        toast.error(data.error);
      }
    } catch {
      toast.error("Failed to delete cashier.");
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-transparent transition-colors duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 text-gray-900 dark:text-white">
            <div className="bg-brand-100 dark:bg-brand-900/40 p-2 text-brand-700 dark:text-brand-400 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            Staff Manager
          </h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 pl-12 font-medium">Manage cashier access and active sessions</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fetchCashiers} disabled={loading} className="gap-2 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-gray-400' : 'text-gray-600 dark:text-zinc-400'}`} />
            Refresh
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-700 hover:bg-brand-800 gap-2 shadow-sm font-medium">
                <UserPlus className="w-4 h-4" />
                Add Cashier
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] dark:bg-zinc-900 dark:border-zinc-800 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-black dark:text-white">Add New Cashier</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[10px] uppercase font-black text-gray-400 dark:text-zinc-500">Full Name or Alias</Label>
                  <Input 
                    id="name" 
                    value={newCashierName}
                    onChange={(e) => setNewCashierName(e.target.value)}
                    placeholder="e.g. Sarah J."
                    autoFocus
                    required
                    className="rounded-xl dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  />
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    Cashiers must select this exact name to log in.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={isAdding} className="bg-brand-700 hover:bg-brand-800 w-full sm:w-auto">
                    {isAdding ? "Adding..." : "Add User"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        {loading && cashiers.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center">
            <RefreshCw className="w-8 h-8 animate-spin mb-4 text-brand-400 dark:text-brand-500" />
            Loading cashiers...
          </div>
        ) : cashiers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 dark:bg-zinc-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-200 dark:border-zinc-700">
              <Users className="w-8 h-8 text-gray-400 dark:text-zinc-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">No cashiers configured</h3>
            <p className="text-gray-500 dark:text-zinc-400 text-sm max-w-md mx-auto">Create allowed names here. Only these names will be able to log into the `/cashier` portal.</p>
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="mt-6 border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-900/20 hover:bg-brand-50 dark:hover:bg-brand-900/30">
              Add First Cashier
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-zinc-800/50 text-gray-600 dark:text-zinc-400 border-b border-gray-100 dark:border-zinc-800 uppercase text-xs font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Cashier Name</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Last Login</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/50">
                {cashiers.map((cashier, idx) => (
                  <tr key={idx} className="hover:bg-brand-50/30 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-zinc-100">{cashier.Name}</td>
                    <td className="px-6 py-4">
                      {cashier.Status === 'Online' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200/50 dark:border-none">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 font-medium border border-gray-200/50 dark:border-none">
                          <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-zinc-600 rounded-full" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-zinc-500 font-medium">{cashier['Last Login']}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {cashier.Status === 'Online' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleForceLogOut(cashier.Name)}
                            className="h-8 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 border-amber-200 dark:border-amber-900/50 hover:text-amber-700 shadow-none font-semibold text-xs"
                          >
                            <PowerOff className="w-3.5 h-3.5 mr-1" />
                            Force Disconnect
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(cashier.Name)}
                          className="h-8 w-8 text-gray-400 dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
