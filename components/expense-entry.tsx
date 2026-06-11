"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSyncStore } from "@/lib/store";
import { Camera, Check, Loader2, Receipt } from "lucide-react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";

type RecentExpense = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  paymentMethod: string;
  paidTo: string;
};

import { EXPENSE_CATEGORIES, PAYMENT_METHODS, STORAGE_KEYS, SYSTEM_DEFAULTS } from "@/lib/constants";

export function ExpenseEntry({ onSaved }: { onSaved?: () => void } = {}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);
  const [batchItems, setBatchItems] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "",
    description: "",
    paidTo: "",
    paymentMethod: PAYMENT_METHODS[0],
    receiptUrl: "",
    status: "Unpaid" as "Paid" | "Unpaid",
  });

  const { cachedExpenses } = useSyncStore();

  const uniqueVendors = useMemo(() => {
    const names = new Set<string>();
    cachedExpenses.forEach((e: any) => {
      const n = (e["PAID TO"] || "").trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort();
  }, [cachedExpenses]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > SYSTEM_DEFAULTS.MAX_UPLOAD_SIZE_BYTES) {
      toast.error("File is too large. Max 5MB.");
      return;
    }

    setIsUploading(true);
    const uploadToast = toast.loading("Uploading receipt...");

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      });

      if (!res.ok) throw new Error("Upload failed");

      const { url } = await res.json();
      setFormData((prev) => ({ ...prev, receiptUrl: url }));
      toast.success("Receipt uploaded successfully!", { id: uploadToast });
    } catch (err: any) {
      toast.error(
        "Failed to upload photo. You can try again or save without it.",
        { id: uploadToast },
      );
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReview = () => {
    if (!formData.amount || !formData.category || !formData.description) {
      toast.error("Please fill in Amount, Category, and Description.");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleAddToBatch = () => {
    if (!formData.amount || !formData.category || !formData.description) {
      toast.error("Please fill in Amount, Category, and Description.");
      return;
    }
    const item = {
      DATE: formData.date,
      AMOUNT: formData.amount,
      CATEGORY: formData.category,
      DESCRIPTION: formData.description,
      'PAID TO': formData.paidTo,
      'PAYMENT METHOD': formData.paymentMethod,
      'RECEIPT URL': formData.receiptUrl,
      STATUS: formData.status,
    };

    setBatchItems((prev) => [item, ...prev]);

    const saved: RecentExpense = {
      id: `local-${Date.now()}`,
      amount: formData.amount,
      category: formData.category,
      description: formData.description,
      date: formData.date,
      paymentMethod: formData.paymentMethod,
      paidTo: formData.paidTo,
    };
    setRecentExpenses((prev) => [saved, ...prev].slice(0, 20));

    toast.success(`Added ₦${Number(formData.amount).toLocaleString()} to batch`);

    setFormData({
      date: new Date().toISOString().split("T")[0],
      amount: "",
      category: "",
      description: "",
      paidTo: formData.paidTo,
      paymentMethod: PAYMENT_METHODS[0],
      receiptUrl: "",
      status: "Unpaid",
    });
  };

  const handleSaveBatch = async () => {
    if (batchItems.length === 0) {
      toast.error("No items in batch to save.");
      return;
    }

    try {
      const loggedBy = localStorage.getItem(STORAGE_KEYS.USER_NAME) || "Unknown";
      const items = batchItems.map((it) => ({ ...it, 'Logged By': loggedBy }));

      useSyncStore.getState().addPendingEntry("expense", { batch: true, items });
      const queue = useSyncStore.getState().pendingQueue;
      const entryId = queue[queue.length - 1]?.id ?? "";

      toast.success(`${batchItems.length} expenses logged`, {
        action: {
          label: "Undo",
          onClick: () => {
            useSyncStore.getState().removeEntry(entryId);
            toast.info("Batch removed.");
          },
        },
      });

      setBatchItems([]);
      setRecentExpenses([]);
      setShowConfirmModal(false);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to queue batch.");
    }
  };

  const handleSave = async () => {
    const loggedBy = localStorage.getItem(STORAGE_KEYS.USER_NAME) || "Unknown";
    const payload = {
      DATE: formData.date,
      AMOUNT: formData.amount,
      CATEGORY: formData.category,
      DESCRIPTION: formData.description,
      "PAID TO": formData.paidTo,
      "PAYMENT METHOD": formData.paymentMethod,
      "RECEIPT URL": formData.receiptUrl,
      "Logged By": loggedBy,
      STATUS: formData.status,
      "PAID BY": formData.status === "Paid" ? loggedBy : "",
      "PAID AT": formData.status === "Paid" ? new Date().toISOString() : "",
    };

    try {
      useSyncStore.getState().addPendingEntry("expense", payload);

      const queue = useSyncStore.getState().pendingQueue;
      const entryId = queue[queue.length - 1]?.id ?? "";

      const saved: RecentExpense = {
        id: entryId,
        amount: formData.amount,
        category: formData.category,
        description: formData.description,
        date: formData.date,
        paymentMethod: formData.paymentMethod,
        paidTo: formData.paidTo,
      };
      setRecentExpenses(prev => [saved, ...prev].slice(0, 5));

      setShowConfirmModal(false);

      toast.success(`₦${Number(formData.amount).toLocaleString()} logged`, {
        description: `${formData.category} · ${formData.description}`,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            useSyncStore.getState().removeEntry(entryId);
            setRecentExpenses(prev => prev.filter(e => e.id !== entryId));
            toast.info("Expense removed.", { duration: 2000 });
          },
        },
      });
      onSaved?.();

      setFormData({
        date: new Date().toISOString().split("T")[0],
        amount: "",
        category: "",
        description: "",
        paidTo: "",
        paymentMethod: PAYMENT_METHODS[0],
        receiptUrl: "",
        status: "Unpaid",
      });
    } catch (err) {
      toast.error("Error saving expense locally.");
    }
  };

  const fieldLabelSx = {
    fontSize: "0.625rem",
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "text.secondary",
    mb: 0.5,
    display: "block",
  };

  return (
    <>
      <Box sx={{ width: "100%", maxWidth: 672, mx: "auto", p: { xs: 1, md: 2 } }}>
        <Card>
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: "grey.50",
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 900, color: "primary.main" }}>
              Expense Entry
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
              Record expenditures to the Expenses sheet.
            </Typography>
          </Box>

          <CardContent>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2,
              }}
            >
              <Box>
                <Typography component="label" htmlFor="exp-date" sx={fieldLabelSx}>
                  Date
                </Typography>
                <DatePicker
                  value={formData.date ? dayjs(formData.date) : null}
                  onChange={(val) => setFormData({ ...formData, date: val?.format("YYYY-MM-DD") ?? "" })}
                  slotProps={{ textField: { size: "small", fullWidth: true, id: "exp-date" } }}
                />
              </Box>

              <Box>
                <Typography component="label" htmlFor="exp-amount" sx={fieldLabelSx}>
                  Amount (₦)
                </Typography>
                <TextField
                  id="exp-amount"
                  type="number"
                  fullWidth
                  size="small"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  slotProps={{ htmlInput: { style: { fontWeight: 700 } } }}
                />
              </Box>

              <Box>
                <Typography component="label" sx={fieldLabelSx}>
                  Category
                </Typography>
                <Autocomplete
                  options={EXPENSE_CATEGORIES}
                  value={formData.category || null}
                  onChange={(_, newValue) =>
                    setFormData({ ...formData, category: newValue ?? "" })
                  }
                  size="small"
                  renderInput={(params) => (
                    <TextField {...params} placeholder="Select category..." />
                  )}
                />
              </Box>

              <Box>
                <Typography component="label" htmlFor="exp-method" sx={fieldLabelSx}>
                  Method
                </Typography>
                <FormControl fullWidth size="small">
                  <Select
                    id="exp-method"
                    value={formData.paymentMethod}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentMethod: e.target.value })
                    }
                    sx={{ fontWeight: 700 }}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <MenuItem key={method} value={method}>
                        {method}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box>
                <Typography component="label" sx={fieldLabelSx}>
                  Payment Status
                </Typography>
                <Stack direction="row" sx={{ gap: 1, height: 40 }}>
                  <Button
                    fullWidth
                    variant={formData.status === "Unpaid" ? "contained" : "outlined"}
                    color={formData.status === "Unpaid" ? "primary" : "inherit"}
                    onClick={() => setFormData({ ...formData, status: "Unpaid" })}
                    sx={{ fontWeight: 900, fontSize: "0.85rem" }}
                  >
                    Unpaid
                  </Button>
                  <Button
                    fullWidth
                    variant={formData.status === "Paid" ? "contained" : "outlined"}
                    color={formData.status === "Paid" ? "success" : "inherit"}
                    onClick={() => setFormData({ ...formData, status: "Paid" })}
                    sx={{ fontWeight: 900, fontSize: "0.85rem" }}
                  >
                    Paid
                  </Button>
                </Stack>
              </Box>

              <Box>
                <Typography component="label" htmlFor="exp-paidto" sx={fieldLabelSx}>
                  Paid To
                </Typography>
                <Autocomplete
                  freeSolo
                  options={uniqueVendors}
                  value={formData.paidTo}
                  onInputChange={(_, newValue) =>
                    setFormData({ ...formData, paidTo: newValue })
                  }
                  onChange={(_, newValue) =>
                    setFormData({ ...formData, paidTo: (newValue as string) ?? "" })
                  }
                  size="small"
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      id="exp-paidto"
                      placeholder="Vendor/Person"
                      sx={{ "& input": { fontWeight: 700 } }}
                    />
                  )}
                />
              </Box>

              <Box sx={{ gridColumn: { xs: "1", md: "1 / -1" } }}>
                <Typography component="label" htmlFor="exp-desc" sx={fieldLabelSx}>
                  Description
                </Typography>
                <TextField
                  id="exp-desc"
                  fullWidth
                  size="small"
                  placeholder="Reason for expense"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  slotProps={{ htmlInput: { style: { fontWeight: 700 } } }}
                />
              </Box>

              <Box sx={{ gridColumn: { xs: "1", md: "1 / -1" } }}>
                <Typography component="label" htmlFor="exp-photo" sx={{ ...fieldLabelSx, color: "text.disabled" }}>
                  Receipt Photo (Optional)
                </Typography>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
                  <Box sx={{ position: "relative", flex: 1 }}>
                    <input
                      id="exp-photo"
                      type="file"
                      accept="image/*"
                      {...({ capture: "environment" } as any)}
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      style={{
                        opacity: 0,
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        cursor: "pointer",
                        zIndex: 1,
                      }}
                    />
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1,
                        border: "2px dashed",
                        borderRadius: 2,
                        p: 1.5,
                        borderColor: formData.receiptUrl ? "success.light" : "divider",
                        bgcolor: formData.receiptUrl ? "success.50" : "grey.50",
                        color: formData.receiptUrl ? "success.main" : "text.secondary",
                        transition: "all 0.2s",
                      }}
                    >
                      {isUploading ? (
                        <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} />
                      ) : formData.receiptUrl ? (
                        <Check style={{ width: 20, height: 20 }} />
                      ) : (
                        <Camera style={{ width: 20, height: 20 }} />
                      )}
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {isUploading
                          ? "Uploading..."
                          : formData.receiptUrl
                            ? "Photo Attached"
                            : "Take Photo / Upload"}
                      </Typography>
                    </Box>
                  </Box>
                  {formData.receiptUrl && (
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setFormData({ ...formData, receiptUrl: "" })}
                    >
                      Remove
                    </Button>
                  )}
                </Stack>
              </Box>
            </Box>
          </CardContent>

          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: "grey.50",
            }}
          >
            <Stack direction="row" sx={{ gap: 1.5 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={handleAddToBatch}
                sx={{ height: 48, fontWeight: 700 }}
              >
                Add to Batch
              </Button>
              <Button
                variant="contained"
                fullWidth
                onClick={handleReview}
                sx={{ height: 48, fontWeight: 700 }}
              >
                Review & Save
              </Button>
            </Stack>
          </Box>
        </Card>
      </Box>

      {recentExpenses.length > 0 && (
        <Box sx={{ width: "100%", maxWidth: 672, mx: "auto", px: { xs: 1, md: 2 }, pb: 4 }}>
          <Card>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                py: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: "grey.50",
              }}
            >
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <Receipt style={{ width: 14, height: 14, color: "#6B7480" }} />
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
                  This Session
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 900, color: "text.disabled" }}>
                {recentExpenses.length} logged
              </Typography>
            </Box>
            <List disablePadding>
              {recentExpenses.map((exp, i) => (
                <ListItem
                  key={exp.id}
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: i < recentExpenses.length - 1 ? "1px solid" : "none",
                    borderColor: "divider",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {exp.category}
                    </Typography>
                    <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", mt: 0.25 }}>
                      {exp.description}{exp.paidTo ? ` · ${exp.paidTo}` : ""} · {exp.paymentMethod}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "error.main", flexShrink: 0 }}>
                    ₦{Number(exp.amount).toLocaleString()}
                  </Typography>
                </ListItem>
              ))}
            </List>
          </Card>
        </Box>
      )}

      <Dialog
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
            color: "primary.main",
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "grey.50",
            fontSize: "1.25rem",
          }}
        >
          {batchItems.length > 0 ? "Confirm Expenses" : "Confirm Expense"}
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontWeight: 500 }}>
            Review before pushing to Google Sheets.
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ p: 2, mt: 1 }}>
          {batchItems.length > 0 ? (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 900 }}>Batch Preview</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {batchItems.length} items ready to save
                  </Typography>
                </Box>
              </Box>
              <List disablePadding sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                {batchItems.map((b, i) => (
                  <ListItem
                    key={i}
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderBottom: i < batchItems.length - 1 ? "1px solid" : "none",
                      borderColor: "divider",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.CATEGORY}
                      </Typography>
                      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", mt: 0.25 }}>
                        {b.DESCRIPTION}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 900, color: "error.main" }}>
                      ₦{Number(b.AMOUNT).toLocaleString()}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
                bgcolor: "grey.50",
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box>
                <Typography sx={fieldLabelSx}>Date</Typography>
                <Typography sx={{ fontWeight: 700 }}>{formData.date}</Typography>
              </Box>
              <Box>
                <Typography sx={fieldLabelSx}>Category</Typography>
                <Typography sx={{ fontWeight: 700 }}>{formData.category}</Typography>
              </Box>
              <Box>
                <Typography sx={fieldLabelSx}>Method</Typography>
                <Typography sx={{ fontWeight: 700 }}>{formData.paymentMethod}</Typography>
              </Box>
              <Box>
                <Typography sx={fieldLabelSx}>Amount</Typography>
                <Typography sx={{ fontWeight: 900, fontSize: "1.125rem", color: "error.main" }}>
                  ₦{Number(formData.amount).toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ gridColumn: "1 / 2", borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                <Typography sx={fieldLabelSx}>Paid To</Typography>
                <Typography sx={{ fontWeight: 700 }}>{formData.paidTo || "—"}</Typography>
              </Box>
              <Box sx={{ gridColumn: "2 / 3", borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                <Typography sx={fieldLabelSx}>Status</Typography>
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    px: 1,
                    py: 0.25,
                    borderRadius: 10,
                    fontSize: "0.75rem",
                    fontWeight: 900,
                    bgcolor: formData.status === "Paid" ? "success.50" : "primary.50",
                    color: formData.status === "Paid" ? "success.main" : "primary.main",
                  }}
                >
                  {formData.status}
                </Box>
              </Box>
              <Box sx={{ gridColumn: "1 / -1", borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                <Typography sx={fieldLabelSx}>Description</Typography>
                <Typography sx={{ fontWeight: 500, lineHeight: 1.6 }}>{formData.description}</Typography>
              </Box>
              {formData.receiptUrl && (
                <Box sx={{ gridColumn: "1 / -1", borderTop: "1px solid", borderColor: "divider", pt: 1.5, textAlign: "center" }}>
                  <Typography sx={{ ...fieldLabelSx, mb: 1 }}>Receipt Preview</Typography>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.receiptUrl}
                    alt="Receipt"
                    style={{ maxHeight: 160, margin: "0 auto", display: "block", borderRadius: 8, border: "1px solid #ECE7E0" }}
                  />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: 2,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "grey.50",
            gap: 1,
          }}
        >
          <Button
            variant="outlined"
            onClick={() => setShowConfirmModal(false)}
            sx={{ flex: 1, height: 48, fontWeight: 700 }}
          >
            Edit
          </Button>
          {batchItems.length > 0 ? (
            <Button
              variant="contained"
              onClick={handleSaveBatch}
              disabled={isSaving}
              sx={{ flex: 1, height: 48, fontWeight: 700 }}
            >
              Save {batchItems.length} Items
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={isSaving}
              sx={{ flex: 1, height: 48, fontWeight: 700 }}
            >
              Confirm Save
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
