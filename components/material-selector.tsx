"use client";

import { ResponsiveSheet } from "@/components/responsive-sheet";
import { materialPickerStyles as styles } from "@/app/theme";

import { useState, useMemo } from "react";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { Package, ChevronDown } from "lucide-react";

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
    <Box>
      <Box component="button" type="button" onClick={() => setOpen(true)} sx={styles.trigger} aria-haspopup="dialog">
        <Box sx={styles.triggerText}>
          <Typography component="span" sx={styles.triggerLabel}>Material *</Typography>
          {selected ? (
            <>
              <Typography component="span" sx={styles.triggerValue}>{selected["Material ID"]}</Typography>
              <Typography component="span" sx={styles.triggerSub}>
                {parseNum(selected["Width (ft)"])} ft wide · ₦{parseNum(selected["Selling Price"]).toLocaleString()} per sq ft
              </Typography>
            </>
          ) : (
            <Typography component="span" sx={styles.triggerPlaceholder}>{loading ? "Loading materials…" : "Tap to choose a material"}</Typography>
          )}
        </Box>
        <ChevronDown size={18} />
      </Box>

      <ResponsiveSheet open={open} onClose={() => setOpen(false)} title="Choose a material">
        <Box sx={styles.search}>
          <TextField placeholder="Search materials" value={search} onChange={(e) => setSearch(e.target.value)} fullWidth type="search" />
        </Box>
        <Box sx={styles.list}>
          {Object.entries(grouped).map(([materialName, options]) => (
            <Box key={materialName}>
              <Typography sx={styles.group}>{materialName}</Typography>
              <Box sx={styles.options}>
                {options.map((mat) => {
                  const remaining = parseNum(mat["Total Remaining (ft)"]);
                  const capacity = parseNum(mat["Total Capacity (ft)"]);
                  const pct = capacity > 0 ? Math.min(100, (remaining / capacity) * 100) : 0;
                  const isOut = remaining <= 0 || mat.Status === "Out of Stock";
                  const isLow = mat.Status === "Low Stock";
                  const tone = isOut ? "error" : isLow ? "warning" : "success";
                  return (
                    <Box key={mat["Material ID"]} component="button" type="button" disabled={isOut}
                      aria-pressed={mat["Material ID"] === selectedMaterialId}
                      onClick={() => { onSelect(mat); setOpen(false); setSearch(""); }}
                      sx={[styles.option, ...(mat["Material ID"] === selectedMaterialId ? [styles.optionSelected] : [])]}>
                      <Box sx={styles.optionTop}>
                        <Box>
                          <Typography sx={styles.optionName}>{mat["Material ID"]}</Typography>
                          <Typography sx={styles.optionSub}>{parseNum(mat["Width (ft)"])} ft wide · ₦{parseNum(mat["Selling Price"]).toLocaleString()} per sq ft</Typography>
                        </Box>
                        <Box component="span" sx={[styles.stock, styles[`stock_${tone}`]]}>{isOut ? "Out of stock" : `${remaining.toFixed(0)} ft left`}</Box>
                      </Box>
                      <Box sx={styles.meter}><Box sx={[styles.meterFill, styles[`fill_${tone}`], { width: `${pct}%` }]} /></Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}
          {filtered.length === 0 && (
            <Box sx={styles.empty}>
              <Package size={32} />
              <Typography>No materials found</Typography>
            </Box>
          )}
        </Box>
      </ResponsiveSheet>
    </Box>
  );
}
