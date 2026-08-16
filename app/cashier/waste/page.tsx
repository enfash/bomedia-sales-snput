"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Scissors } from "lucide-react";
import { toast } from "sonner";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";

import { WasteLogModal, type InventoryRollForWaste } from "@/components/waste-log-modal";

export default function LogWastePage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryRollForWaste[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedItem, setSelectedItem] = useState<InventoryRollForWaste | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchInventory = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      if (res.ok) {
        const data = json.data || [];
        // Filter out items that have no stock
        const activeItems = data.filter((item: any) => {
          const rem = parseFloat(item["Remaining Length (ft)"] || item.Stock || "0");
          return rem > 0;
        });
        setItems(activeItems);
        if (activeItems.length > 0 && !selectedItem) setSelectedItem(activeItems[0]);
      } else {
        toast.error("Failed to load materials");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchInventory(); }, []);

  const handleSelectMaterial = (rowIndexStr: string) => {
    const item = items.find(i => i._rowIndex.toString() === rowIndexStr) || null;
    setSelectedItem(item);
  };

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
      {children}
    </Typography>
  );

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", bgcolor: "rgba(225,29,72,0.02)" }}>
        <Box sx={{ textAlign: "center" }}>
          <RefreshCw size={40} color="#e11d48" className="animate-spin" style={{ margin: "0 auto 16px" }} />
          <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
            Loading inventory rolls...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "rgba(225,29,72,0.02)", minHeight: "100vh", pb: 16 }}>
      <Box sx={{ maxWidth: 672, mx: "auto" }}>

        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <IconButton size="small" onClick={() => router.back()} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 99 }}>
              <ArrowLeft size={16} />
            </IconButton>
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>Log Waste</Typography>
                {refreshing && <RefreshCw size={14} color="#e11d48" className="animate-spin" />}
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Select a roll and record material loss.
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={fetchInventory} disabled={refreshing} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 99 }}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </IconButton>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Card sx={{ borderRadius: "2rem", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Box>
                  <FieldLabel>Select Target Material Roll</FieldLabel>
                  <Box
                    component="select"
                    id="material-select"
                    value={selectedItem?._rowIndex.toString() || ""}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSelectMaterial(e.target.value)}
                    sx={{
                      width: "100%", height: 48, px: 2, borderRadius: 2.5,
                      border: "1px solid", borderColor: "divider",
                      bgcolor: "grey.50", color: "text.primary",
                      fontWeight: 700, fontSize: "0.875rem",
                      outline: "none", cursor: "pointer",
                      "&:focus": { borderColor: "#e11d48", boxShadow: "0 0 0 2px rgba(225,29,72,0.2)" },
                    }}
                  >
                    {items.map((item: any) => (
                      <option key={item._rowIndex} value={item._rowIndex.toString()}>
                        {item["Roll ID"]} — {item["Item Name"]} ({parseFloat(item["Remaining Length (ft)"]?.toString() || item["Stock"]?.toString() || "0").toFixed(1)}ft left)
                      </option>
                    ))}
                  </Box>
                </Box>
                
                <Button
                  variant="contained"
                  onClick={() => setIsModalOpen(true)}
                  disabled={!selectedItem}
                  startIcon={<Scissors size={18} />}
                  sx={{
                    height: 56,
                    borderRadius: 3,
                    bgcolor: "#e11d48",
                    color: "white",
                    fontWeight: 900,
                    fontSize: "1.125rem",
                    "&:hover": { bgcolor: "#be123c" },
                  }}
                >
                  Log Waste for {selectedItem ? selectedItem["Roll ID"] : "Selected Roll"}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {selectedItem && (
          <WasteLogModal
            roll={selectedItem}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSaved={() => {
              setIsModalOpen(false);
              fetchInventory();
            }}
          />
        )}
      </Box>
    </Box>
  );
}
