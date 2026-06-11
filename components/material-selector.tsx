"use client";

import { useState, useMemo } from "react";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { Package, Layers, ChevronDown } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import { useMediaQuery } from "@/lib/useMediaQuery";

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
  const isMobile = useMediaQuery("(max-width: 768px)");

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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      <Typography
        component="label"
        sx={{
          fontSize: "0.625rem",
          textTransform: "uppercase",
          fontWeight: 900,
          color: "text.secondary",
          letterSpacing: "0.08em",
          display: "flex",
          alignItems: "center",
          gap: 0.75,
        }}
      >
        <Package style={{ width: 12, height: 12 }} />
        Select Material *
      </Typography>

      <Box
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        sx={{
          width: "100%",
          height: 56,
          borderRadius: 3,
          border: "2px solid",
          borderColor: selectedMaterialId ? "primary.main" : "grey.300",
          bgcolor: selectedMaterialId ? "primary.main" : "background.paper",
          px: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          transition: "border-color 0.15s ease, background-color 0.15s ease",
          textAlign: "left",
          "&:hover": {
            borderColor: selectedMaterialId ? "primary.dark" : "primary.main",
          },
        }}
      >
        {selected ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                bgcolor: "primary.dark",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Layers style={{ width: 16, height: 16, color: "#fff" }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 900,
                  color: "primary.contrastText",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selected["Material ID"]}
              </Typography>
              <Typography sx={{ fontSize: "0.625rem", color: "primary.contrastText", opacity: 0.8, fontWeight: 500 }}>
                {parseNum(selected["Width (ft)"])}ft wide · ₦{parseNum(selected["Selling Price"]).toLocaleString()}/sqft
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 500, color: "text.secondary" }}>
            {loading ? "Loading materials…" : "Tap to choose material…"}
          </Typography>
        )}
        <ChevronDown style={{ width: 16, height: 16, flexShrink: 0, marginLeft: 8, color: selectedMaterialId ? "#fff" : undefined }} />
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={isMobile}
        slotProps={{
          paper: {
            sx: isMobile ? {
              mt: "12vh",
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              bgcolor: "background.default",
              display: "flex",
              flexDirection: "column",
            } : {
              borderRadius: 4,
              maxHeight: "85vh",
              bgcolor: "background.default",
            }
          }
        }}
        sx={isMobile ? {
          "& .MuiDialog-container": {
            alignItems: "flex-end",
          }
        } : undefined}
        maxWidth="sm"
        fullWidth
      >
        {isMobile && <Box sx={{ width: 48, height: 6, borderRadius: 3, bgcolor: "divider", mx: "auto", mt: 2, mb: 1, flexShrink: 0 }} />}

        <Box sx={{ px: 3, pt: 2, pb: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: 900, color: "text.primary", mb: 2 }}>
            Choose a Material
          </Typography>
              <TextField
                placeholder="Search materials…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
                autoFocus
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
              />
            </Box>

            <Box sx={{ overflowY: "auto", flex: 1, p: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
              {Object.entries(grouped).map(([materialName, options]) => (
                <Box key={materialName}>
                  <Typography
                    sx={{
                      fontSize: "0.625rem",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: "text.secondary",
                      mb: 1,
                      px: 0.5,
                    }}
                  >
                    {materialName}
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {options.map((mat) => {
                      const remaining = parseNum(mat["Total Remaining (ft)"]);
                      const capacity = parseNum(mat["Total Capacity (ft)"]);
                      const pct = capacity > 0 ? Math.min(100, (remaining / capacity) * 100) : 0;
                      const isOut = remaining <= 0 || mat.Status === "Out of Stock";
                      const isSelected = mat["Material ID"] === selectedMaterialId;
                      const isLowStock = mat.Status === "Low Stock";

                      return (
                        <Box
                          key={mat["Material ID"]}
                          component="button"
                          type="button"
                          disabled={isOut}
                          onClick={() => {
                            onSelect(mat);
                            setOpen(false);
                            setSearch("");
                          }}
                          sx={{
                            width: "100%",
                            p: 2,
                            borderRadius: 3,
                            border: "2px solid",
                            borderColor: isSelected ? "primary.main" : isOut ? "grey.200" : "grey.200",
                            bgcolor: isSelected ? "primary.light" : isOut ? "transparent" : "background.paper",
                            opacity: isOut ? 0.4 : 1,
                            cursor: isOut ? "not-allowed" : "pointer",
                            textAlign: "left",
                            transition: "border-color 0.15s ease, background-color 0.15s ease",
                            "&:hover:not(:disabled)": {
                              borderColor: "primary.main",
                            },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                            <Box>
                              <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "text.primary" }}>
                                {mat["Material ID"]}
                              </Typography>
                              <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500, mt: 0.5 }}>
                                {parseNum(mat["Width (ft)"])}ft wide · ₦{parseNum(mat["Selling Price"]).toLocaleString()}/sqft
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                fontSize: "0.5625rem",
                                fontWeight: 900,
                                textTransform: "uppercase",
                                px: 0.75,
                                py: 0.25,
                                borderRadius: 1,
                                bgcolor: isLowStock ? "warning.light" : isOut ? "error.light" : "success.light",
                                color: isLowStock ? "warning.dark" : isOut ? "error.dark" : "success.dark",
                              }}
                            >
                              {remaining.toFixed(0)}ft left
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              width: "100%",
                              height: 6,
                              borderRadius: 99,
                              bgcolor: "grey.200",
                              overflow: "hidden",
                            }}
                          >
                            <Box
                              sx={{
                                height: "100%",
                                borderRadius: 99,
                                width: `${pct}%`,
                                bgcolor: isLowStock ? "warning.main" : isOut ? "error.main" : "success.main",
                                transition: "width 300ms ease-out",
                              }}
                            />
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              ))}

              {filtered.length === 0 && (
                <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
                  <Package style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.4 }} />
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 500 }}>No materials found</Typography>
                </Box>
              )}
            </Box>
      </Dialog>
    </Box>
  );
}
