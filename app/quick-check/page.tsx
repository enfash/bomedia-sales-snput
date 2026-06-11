"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Ruler, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Chip from "@mui/material/Chip";

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
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        if (data.length > 0 && !selectedItem) setSelectedItem(data[0]);
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

  const parsedWidth  = parseFloat(width) || 0;
  const parsedLength = parseFloat(length) || 0;
  const parsedWaste  = parseFloat(wasteFactor) || 0;

  const lengthInFeet      = lengthUnit === "m" ? parsedLength * 3.28084 : parsedLength;
  const requestedArea     = parsedWidth * lengthInFeet;
  const wasteArea         = requestedArea * (parsedWaste / 100);
  const totalRequiredArea = requestedArea + wasteArea;

  const rollWidth  = parseFloat(selectedItem?.["Width (ft)"]?.toString() || "0") || 0;
  const rollStock  = parseFloat(selectedItem?.["Stock"]?.toString() || "0") || 0;

  const widthOk      = rollWidth >= parsedWidth;
  const stockOk      = rollStock >= totalRequiredArea;
  const netStockOk   = rollStock >= requestedArea;
  const isFulfilled  = widthOk && stockOk;
  const canFulfillNet = widthOk && netStockOk;

  const alternativeFulfillments = items.filter(item => {
    const rWidth = parseFloat(item["Width (ft)"]?.toString() || "0") || 0;
    const rStock = parseFloat(item["Stock"]?.toString() || "0") || 0;
    return rWidth >= parsedWidth && rStock >= totalRequiredArea && item._rowIndex !== selectedItem?._rowIndex;
  });

  const resultBg = isFulfilled
    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
    : canFulfillNet
    ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
    : "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)";

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary", display: "block", mb: 0.75 }}>
      {children}
    </Typography>
  );

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", bgcolor: "rgba(232,161,58,0.02)" }}>
        <Box sx={{ textAlign: "center" }}>
          <RefreshCw size={40} color="#E8A13A" className="animate-spin" style={{ margin: "0 auto 16px" }} />
          <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
            Loading inventory nodes...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "rgba(232,161,58,0.02)", minHeight: "100vh", pb: 16 }}>
      <Box sx={{ maxWidth: 672, mx: "auto" }}>

        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <IconButton size="small" onClick={() => router.back()} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 99 }}>
              <ArrowLeft size={16} />
            </IconButton>
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>Quick-Check</Typography>
                {refreshing && <RefreshCw size={14} color="#E8A13A" className="animate-spin" />}
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Evaluate physical inventory roll capacities.
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={fetchInventory} disabled={refreshing} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 99 }}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </IconButton>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

          {/* Input panel */}
          <Card sx={{ borderRadius: "2rem", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {/* Material select */}
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
                      "&:focus": { borderColor: "warning.main", boxShadow: "0 0 0 2px rgba(232,161,58,0.2)" },
                    }}
                  >
                    {items.map(item => (
                      <option key={item._rowIndex} value={item._rowIndex.toString()}>
                        {item["Item Name"]} | {parseFloat(item["Width (ft)"]?.toString() || "0").toFixed(1)}ft Width ({parseFloat(item["Stock"]?.toString() || "0").toFixed(0)} sqft)
                      </option>
                    ))}
                  </Box>
                </Box>

                {/* Width + Length */}
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                  <Box>
                    <FieldLabel>Print Job Width (Ft)</FieldLabel>
                    <TextField
                      fullWidth type="number" placeholder="e.g. 4"
                      value={width}
                      onChange={e => setWidth(e.target.value)}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><Ruler size={16} /></InputAdornment> } }}
                    />
                  </Box>
                  <Box>
                    <FieldLabel>Print Job Length</FieldLabel>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <TextField
                        fullWidth type="number" placeholder="e.g. 10"
                        value={length}
                        onChange={e => setLength(e.target.value)}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        variant="outlined"
                        onClick={() => setLengthUnit(u => u === "m" ? "ft" : "m")}
                        sx={{ minWidth: 48, fontWeight: 800, textTransform: "uppercase", borderRadius: 2.5, px: 1.5 }}
                      >
                        {lengthUnit}
                      </Button>
                    </Box>
                  </Box>
                </Box>

                {/* Waste buffer */}
                <Box>
                  <FieldLabel>Waste Safety Buffer (%)</FieldLabel>
                  <TextField fullWidth type="number" value={wasteFactor} onChange={e => setWasteFactor(e.target.value)} />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Result card */}
          {parsedWidth > 0 && parsedLength > 0 && selectedItem && (
            <Box sx={{ borderRadius: "2rem", overflow: "hidden", background: resultBg, color: "#fff", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: "center", justifyContent: "space-between", gap: 3, p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box sx={{ p: 1.75, bgcolor: "rgba(255,255,255,0.2)", borderRadius: 3 }}>
                    {isFulfilled ? <CheckCircle2 size={40} /> : canFulfillNet ? <AlertTriangle size={40} /> : <XCircle size={40} />}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.1 }}>
                      {isFulfilled ? "Fulfillment Guaranteed"
                        : canFulfillNet ? "Width Matches, Tight Margin"
                        : !widthOk ? "Roll Too Narrow"
                        : "Insufficient Material Area"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.8)", mt: 1, maxWidth: 320 }}>
                      {!widthOk
                        ? `Job requires ${parsedWidth}ft but roll width is only ${rollWidth}ft.`
                        : isFulfilled
                        ? "Roll satisfies print size and waste coverage."
                        : "Meets square foot totals but exceeds safety boundaries."}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: "center", bgcolor: "rgba(255,255,255,0.1)", p: 2, borderRadius: 3, border: "1px solid rgba(255,255,255,0.1)", minWidth: 150, flexShrink: 0 }}>
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)" }}>Required Sqft</Typography>
                  <Typography sx={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1.1 }}>{totalRequiredArea.toFixed(1)}</Typography>
                  <Typography sx={{ fontSize: "0.625rem", color: "rgba(255,255,255,0.8)", mt: 0.5 }}>Out of {rollStock.toFixed(0)} left</Typography>
                </Box>
              </Box>
            </Box>
          )}

          {/* Alternatives */}
          {parsedWidth > 0 && parsedLength > 0 && alternativeFulfillments.length > 0 && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, px: 0.5 }}>
                <Sparkles size={14} color="#E8A13A" />
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                  Alternative Fulfilling Rolls
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {alternativeFulfillments.map(alt => (
                  <Paper key={alt._rowIndex} variant="outlined" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, borderRadius: 3, "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }, transition: "box-shadow 0.2s" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ p: 1, bgcolor: "rgba(232,161,58,0.1)", borderRadius: 2 }}>
                        <Package size={20} color="#E8A13A" />
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{alt["Item Name"]}</Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>Width: {parseFloat(alt["Width (ft)"].toString()).toFixed(1)}ft</Typography>
                      </Box>
                    </Box>
                    <Chip
                      label={`${parseFloat(alt["Stock"].toString()).toFixed(0)} sqft`}
                      size="small"
                      sx={{ bgcolor: "#d1fae5", color: "#065f46", fontWeight: 700, borderRadius: 2 }}
                    />
                  </Paper>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
