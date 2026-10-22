"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";

import { quickCheckStyles as styles, stockBarStyles } from "@/app/theme";
import { HomeBackLink } from "@/components/back-link";
import { LoadingState } from "@/components/loading-state";
import { SegmentedControl } from "@/components/segmented-control";
import { StockBar } from "@/components/stock-bar";
import { groupRolls } from "@/lib/estimator-view";

type InventoryItem = {
  "Item Name": string;
  "Width (ft)": string | number;
  "Remaining Length (ft)"?: string | number;
  "Unit": string;
  "Price": string | number;
  "Stock"?: string | number;
  _rowIndex: number;
};

export default function QuickCheckPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedKey, setSelectedKey] = useState("");
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
        const first = groupRolls(data)[0];
        if (first) setSelectedKey((key) => key || first.key);
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

  const groups = useMemo(() => groupRolls(items), [items]);
  const selectedGroup = groups.find(g => g.key === selectedKey) ?? null;

  const parsedWidth  = parseFloat(width) || 0;
  const parsedLength = parseFloat(length) || 0;
  const parsedWaste  = parseFloat(wasteFactor) || 0;

  const lengthInFeet      = lengthUnit === "m" ? parsedLength * 3.28084 : parsedLength;
  const requestedArea     = parsedWidth * lengthInFeet;
  const wasteArea         = requestedArea * (parsedWaste / 100);
  const totalRequiredArea = requestedArea + wasteArea;

  const rollWidth  = selectedGroup?.widthFt ?? 0;
  const rollStock  = selectedGroup?.areaSqft ?? 0;

  const widthOk      = rollWidth >= parsedWidth;
  const stockOk      = rollStock >= totalRequiredArea;
  const netStockOk   = rollStock >= requestedArea;
  const isFulfilled  = widthOk && stockOk;
  const canFulfillNet = widthOk && netStockOk;

  const alternativeFulfillments = groups.filter(g => g.widthFt >= parsedWidth && g.areaSqft >= totalRequiredArea && g.key !== selectedGroup?.key);

  const resultStyle = isFulfilled ? styles.resultOk : canFulfillNet ? styles.resultTight : styles.resultNo;

  if (loading) {
    return (
      <Box sx={styles.page}><LoadingState pieces={[{ k: 'heading' }, { k: 'form', n: 3 }]} label="Loading rolls" /></Box>
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
          <TextField select fullWidth label="Material to check" value={selectedKey} onChange={e => setSelectedKey(e.target.value)}
            slotProps={{ select: { renderValue: (key) => { const g = groups.find(x => x.key === key); return g ? `${g.label} · ${g.areaSqft.toFixed(0)} sqft left` : ''; } } }}>
            {groups.map(group => <MenuItem key={group.key} value={group.key} sx={stockBarStyles.menuItem}>
              <Box sx={stockBarStyles.menuTop}><span>{group.label}</span><Typography component="span" variant="body2" sx={stockBarStyles.menuSub}>{group.areaSqft.toFixed(0)} sqft left</Typography></Box>
              <StockBar compact remaining={group.areaSqft} capacity={group.capacitySqft} />
            </MenuItem>)}
          </TextField>

          {selectedGroup && <Box sx={styles.stockBlock}>
            <StockBar remaining={selectedGroup.areaSqft} capacity={selectedGroup.capacitySqft} label={`${selectedGroup.label}: how much is left`} />
            <Typography variant="body2" color="text.secondary">{selectedGroup.areaSqft.toFixed(0)} of {selectedGroup.capacitySqft.toFixed(0)} sq ft left</Typography>
          </Box>}
          <SegmentedControl label="Measure the job length in" value={lengthUnit} options={[{ value: "ft", label: "Feet" }, { value: "m", label: "Meters" }]} onChange={setLengthUnit} />
          <Box sx={styles.pair}>
            <TextField fullWidth type="number" label="Job width (ft)" placeholder="e.g. 4" value={width} onChange={e => setWidth(e.target.value)} />
            <TextField fullWidth type="number" label={`Job length (${lengthUnit})`} placeholder="e.g. 10" value={length} onChange={e => setLength(e.target.value)} />
          </Box>

          <TextField fullWidth type="number" label="Waste buffer (%)" value={wasteFactor} onChange={e => setWasteFactor(e.target.value)} />
        </Paper>

        {parsedWidth > 0 && parsedLength > 0 && selectedGroup && (
          <Paper variant="outlined" sx={resultStyle} role="status">
            <Box sx={styles.resultMain}>
              <Box component="span" sx={styles.resultIcon}>{isFulfilled ? <CheckCircle2 size={36} /> : canFulfillNet ? <AlertTriangle size={36} /> : <XCircle size={36} />}</Box>
              <Box>
                <Typography variant="h5" component="p" sx={styles.resultTitle}>
                  {isFulfilled ? "This material covers it"
                    : canFulfillNet ? "Width fits, margin is tight"
                    : !widthOk ? "Roll is too narrow"
                    : "Not enough material"}
                </Typography>
                <Typography variant="body2">
                  {!widthOk
                    ? `The job needs ${parsedWidth}ft but the roll is only ${rollWidth}ft wide.`
                    : isFulfilled
                    ? "It covers the print size and the waste buffer."
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
              <Typography variant="overline" color="text.secondary">Other materials that would cover it</Typography>
            </Box>
            <Box sx={styles.alternatives}>
              {alternativeFulfillments.map(alt => (
                <Paper key={alt.key} variant="outlined" sx={styles.alternative}>
                  <Box sx={styles.alternativeMain}>
                    <Box component="span" sx={styles.alternativeIcon}><Package size={20} /></Box>
                    <Box>
                      <Typography sx={styles.resultTitle}>{alt.label}</Typography>
                    </Box>
                  </Box>
                  <Chip label={`${alt.areaSqft.toFixed(0)} sqft`} size="small" sx={styles.stockPill} />
                </Paper>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
