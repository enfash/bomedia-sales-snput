"use client";

import { useState, useEffect, Fragment } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { usePathname } from "next/navigation";

type Cashier = {
  Name: string;
  Status: string;
};

export function NamePrompt({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [manualName, setManualName] = useState("");
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [isLoadingCashiers, setIsLoadingCashiers] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (isAdmin) {
      localStorage.setItem("userName", "Elijah");
      setOpen(false);
      return;
    }

    const storedName = localStorage.getItem("userName");

    if (storedName && (storedName.toLowerCase() === "elijah" || storedName.toLowerCase() === "admin") && !isAdmin) {
      localStorage.removeItem("userName");
      setOpen(true);
    } else if (!storedName) {
      setOpen(true);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!open) return;
    setIsLoadingCashiers(true);
    setApiFailed(false);
    fetch("/api/cashiers")
      .then((r) => r.json())
      .then(({ data }) => {
        const list = (data as Cashier[]) || [];
        setCashiers(list);
        if (list.length === 0) setApiFailed(true);
      })
      .catch(() => {
        setApiFailed(true);
        setError("");
      })
      .finally(() => setIsLoadingCashiers(false));
  }, [open]);

  const handleSave = async () => {
    const nameToUse = apiFailed ? manualName.trim() : selectedName;

    if (!nameToUse) {
      setError(apiFailed ? "Please enter your name." : "Please select your name from the list.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameToUse, status: "Online" }),
      }).catch(() => {});

      localStorage.setItem("userName", nameToUse);
      setOpen(false);
      setError("");
    } catch {
      localStorage.setItem("userName", nameToUse);
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (pathname === "/bom03/login" || pathname === "/") return null;

  const activeName = apiFailed ? manualName.trim() : selectedName;

  return (
    <Fragment>
      {open && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            bgcolor: "background.default",
          }}
        />
      )}
      <Dialog
        open={open}
        onClose={(_event: object, reason: string) => { void reason; }}
        slotProps={{ paper: { sx: { borderRadius: 4, maxWidth: 440, width: "100%" } } }}
      >
        <DialogTitle>
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color: "text.primary" }}>
            👋 Welcome to BOMedia
          </Typography>
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 0.5 }}>
            {apiFailed
              ? "Type your name to continue to the cashier portal."
              : "Select your name from the list to continue to the cashier portal."}
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              {apiFailed ? (
                <TextField
                  id="cashier-select"
                  label="Your Name"
                  placeholder="Type your name…"
                  value={manualName}
                  onChange={(e) => {
                    setManualName(e.target.value);
                    setError("");
                  }}
                  fullWidth
                  autoFocus
                  error={!!error}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, fontWeight: 600 } }}
                />
              ) : (
                <FormControl fullWidth error={!!error}>
                  <InputLabel id="cashier-select-label">
                    {isLoadingCashiers ? "Loading cashiers…" : "Select Your Name"}
                  </InputLabel>
                  <Select
                    labelId="cashier-select-label"
                    id="cashier-select"
                    value={selectedName}
                    label={isLoadingCashiers ? "Loading cashiers…" : "Select Your Name"}
                    onChange={(e) => {
                      setSelectedName(e.target.value);
                      setError("");
                    }}
                    disabled={isLoadingCashiers || isSaving}
                    sx={{ borderRadius: 3, fontWeight: 600 }}
                  >
                    {cashiers.map((c) => (
                      <MenuItem key={c.Name} value={c.Name} sx={{ fontWeight: 600 }}>
                        {c.Name}
                        {c.Status === "Online" && (
                          <Typography
                            component="span"
                            sx={{ ml: 1, fontSize: "0.625rem", color: "warning.main", fontWeight: 700 }}
                          >
                            ● active
                          </Typography>
                        )}
                      </MenuItem>
                    ))}
                    {cashiers.length === 0 && !isLoadingCashiers && (
                      <MenuItem disabled>
                        <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                          No cashiers found. Ask admin to add your name.
                        </Typography>
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
              )}

              {!apiFailed && (
                <Box
                  component="button"
                  type="button"
                  onClick={() => { setApiFailed(true); setError(""); }}
                  sx={{
                    mt: 0.75,
                    fontSize: "0.6875rem",
                    color: "text.secondary",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: "2px",
                    p: 0,
                    "&:hover": { color: "primary.main" },
                  }}
                >
                  My name isn't in the list
                </Box>
              )}

              {error && (
                <Typography sx={{ fontSize: "0.75rem", color: "error.main", fontWeight: 500, mt: 0.5 }}>
                  {error}
                </Typography>
              )}
            </Box>

            <Button
              variant="contained"
              fullWidth
              onClick={handleSave}
              disabled={!activeName || isSaving || isLoadingCashiers}
              sx={{ height: 48, borderRadius: 3, fontWeight: 700 }}
            >
              {isSaving ? "Logging in…" : "Get Started"}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
