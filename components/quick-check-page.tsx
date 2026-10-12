"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Ruler, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Chip from "@mui/material/Chip";

import { quickCheckStyles as styles } from "@/app/theme";
import { HomeBackLink } from "@/components/back-link";
import { FieldLabel } from "@/components/estimator/estimator-parts";

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

  useEffect(() => { void Promise.resolve().then(fetchInventory); }, []);

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

  const resultStyle = isFulfilled ? styles.resultOk : canFulfillNet ? styles.resultTight : styles.resultNo;

  if (loading) {
    return (
      <Box sx={styles.page}>
        <Box sx={styles.loading}>
          <Box sx={styles.spinning}><RefreshCw size={32} /></Box>
          <Typography>Loading rolls…</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={styles.page}>
      <HomeBackLink />
      <Box sx={styles.heading}>
        <Box>
          <Typography variant="h3" component="h1">Quick-Check</Typography>
          <Typography color="text.secondary">Check whether a roll can cover a print job.</Typography>
        </Box>
        <IconButton onClick={fetchInventory} disabled={refreshing} aria-label="Refresh rolls"><Box component="span" sx={refreshing ? styles.spinning : styles.iconBox}><RefreshCw size={18} /></Box></IconButton>
      </Box>

      <Box sx={styles.stack}>
        <Paper variant="outlined" sx={styles.form}>
          <TextField select fullWidth label="Roll to check" value={selectedItem?._rowIndex.toString() || ""} onChange={e => handleSelectMaterial(e.target.value)}>
            {items.map(item => (
              <MenuItem key={item._rowIndex} value={item._rowIndex.toString()}>
                {item["Item Name"]} | {parseFloat(item["Width (ft)"]?.toString() || "0").toFixed(1)}ft wide ({parseFloat(item["Stock"]?.toString() || "0").toFixed(0)} sqft)
              </MenuItem>
            ))}
          </TextField>

          <Box sx={styles.pair}>
            <TextField fullWidth type="number" label="Job width (ft)" placeholder="e.g. 4" value={width} onChange={e => setWidth(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Ruler size={16} /></InputAdornment> } }} />
            <Box sx={styles.lengthRow}>
              <TextField fullWidth type="number" label={`Job length (${lengthUnit})`} placeholder="e.g. 10" value={length} onChange={e => setLength(e.target.value)} sx={styles.grow} />
              <Button variant="outlined" color="inherit" onClick={() => setLengthUnit(u => u === "m" ? "ft" : "m")} sx={styles.unitButton} aria-label="Switch length unit">{lengthUnit}</Button>
            </Box>
          </Box>

          <TextField fullWidth type="number" label="Waste buffer (%)" value={wasteFactor} onChange={e => setWasteFactor(e.target.value)} />
        </Paper>

        {parsedWidth > 0 && parsedLength > 0 && selectedItem && (
          <Paper variant="outlined" sx={resultStyle} role="status">
            <Box sx={styles.resultMain}>
              <Box component="span" sx={styles.resultIcon}>{isFulfilled ? <CheckCircle2 size={36} /> : canFulfillNet ? <AlertTriangle size={36} /> : <XCircle size={36} />}</Box>
              <Box>
                <Typography variant="h5" component="p" sx={styles.resultTitle}>
                  {isFulfilled ? "This roll covers it"
                    : canFulfillNet ? "Width fits, margin is tight"
                    : !widthOk ? "Roll too narrow"
                    : "Not enough material"}
                </Typography>
                <Typography variant="body2">
                  {!widthOk
                    ? `The job needs ${parsedWidth}ft but the roll is only ${rollWidth}ft wide.`
                    : isFulfilled
                    ? "The roll covers the print size and the waste buffer."
                    : "It covers the job itself but not the waste buffer."}
                </Typography>
              </Box>
            </Box>
            <Paper variant="outlined" sx={styles.resultNeed}>
              <Typography variant="body2" color="text.secondary">Needed sq ft</Typography>
              <Typography variant="h4" component="p" sx={styles.resultNeedValue}>{totalRequiredArea.toFixed(1)}</Typography>
              <Typography variant="body2" color="text.secondary">of {rollStock.toFixed(0)} left</Typography>
            </Paper>
          </Paper>
        )}

        {parsedWidth > 0 && parsedLength > 0 && alternativeFulfillments.length > 0 && (
          <Box>
            <Box sx={styles.sectionTitle}>
              <Box component="span" sx={styles.sectionIcon}><Sparkles size={16} /></Box>
              <Typography variant="overline" color="text.secondary">Other rolls that would cover it</Typography>
            </Box>
            <Box sx={styles.alternatives}>
              {alternativeFulfillments.map(alt => (
                <Paper key={alt._rowIndex} variant="outlined" sx={styles.alternative}>
                  <Box sx={styles.alternativeMain}>
                    <Box component="span" sx={styles.alternativeIcon}><Package size={20} /></Box>
                    <Box>
                      <Typography sx={styles.resultTitle}>{alt["Item Name"]}</Typography>
                      <Typography variant="body2" color="text.secondary">{parseFloat(alt["Width (ft)"].toString()).toFixed(1)}ft wide</Typography>
                    </Box>
                  </Box>
                  <Chip label={`${parseFloat(alt["Stock"].toString()).toFixed(0)} sqft`} size="small" sx={styles.stockPill} />
                </Paper>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
