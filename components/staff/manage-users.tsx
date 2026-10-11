"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, IconButton, Paper, Switch, TextField, Typography,
} from "@mui/material";
import { Clock, Eye, EyeOff, KeyRound, Plus, RotateCcw, ShieldCheck, Trash2, UserX, Users, X } from "lucide-react";
import { toast } from "sonner";
import { staffManagerStyles as styles } from "@/app/theme";
import { avatarBg, initials, isReallyOnline, lastSeenLabel, staffInView, type Cashier, type StaffView } from "./staff-utils";

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4);
const PIN_PATTERN = /^\d{4}$/;
const pinInputProps = { maxLength: 4, inputMode: "numeric" as const, pattern: "[0-9]*" };

type Access = {
  single_session: boolean;
  staff: { Name: string; Devices: number; Hidden?: boolean }[];
  removed: { Name: string; StaffId: string; RemovedAt: string }[];
};

const removedOn = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
};

async function changeAccess(body: Record<string, unknown>) {
  const res = await fetch("/api/cashiers/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Could not save that change");
  return json;
}

export function ManageUsers({ cashiers, view, onRefresh }: { cashiers: Cashier[]; view: StaffView; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cashier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [pinEditTarget, setPinEditTarget] = useState<Cashier | null>(null);
  const [editPinValue, setEditPinValue] = useState("");
  const [updatingPin, setUpdatingPin] = useState(false);

  const [access, setAccess] = useState<Access | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ Name: string } | null>(null);
  const [restorePin, setRestorePin] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [signingOut, setSigningOut] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    try {
      const res = await fetch("/api/cashiers/access", { cache: "no-store" });
      // Sign-in management only exists on the Postgres sign-in backend; hide it elsewhere.
      setAccess(res.ok ? ((await res.json()).data as Access) : null);
    } catch {
      setAccess(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadAccess();
    });
    return () => {
      active = false;
    };
  }, [loadAccess, cashiers]);

  const handleSingleSession = async (enabled: boolean) => {
    const previous = access;
    setAccess((current) => (current ? { ...current, single_session: enabled } : current));
    try {
      await changeAccess({ action: "single_session", enabled });
      toast.success(enabled ? "Each cashier can now use one device" : "Cashiers can use more than one device");
      await loadAccess();
    } catch (err: any) {
      setAccess(previous);
      toast.error(err.message);
    }
  };

  const handleSignOut = async (name: string) => {
    setSigningOut(name);
    try {
      await changeAccess({ action: "sign_out", name });
      toast.success(`${name} was signed out`);
      await loadAccess();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSigningOut(null);
    }
  };

  const handleHide = async (name: string, hidden: boolean) => {
    try {
      await changeAccess({ action: "hide", name, hidden });
      toast.success(hidden ? `${name} is hidden from the staff lists. Find them under "Hidden staff".` : `${name} is back in the staff lists`);
      await loadAccess();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    if (!PIN_PATTERN.test(restorePin)) {
      toast.error("Enter a PIN of exactly 4 digits");
      return;
    }
    setRestoring(true);
    try {
      await changeAccess({ action: "restore", name: restoreTarget.Name, passcode: restorePin });
      toast.success(`${restoreTarget.Name} restored. Share the new PIN with them.`);
      setRestoreTarget(null);
      setRestorePin("");
      await loadAccess();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRestoring(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    const passcode = newPasscode.trim();
    if (!name) return;
    if (!PIN_PATTERN.test(passcode)) {
      toast.error("Enter a PIN of exactly 4 digits");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cashiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, passcode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      toast.success(`${name} added as cashier`);
      setNewName("");
      setNewPasscode("");
      setShowForm(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdatePin = async () => {
    if (!pinEditTarget) return;
    const pin = editPinValue.trim();
    if (!PIN_PATTERN.test(pin)) {
      toast.error("Enter a PIN of exactly 4 digits");
      return;
    }
    setUpdatingPin(true);
    try {
      const res = await fetch("/api/cashiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pinEditTarget.Name, passcode: pin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update PIN");
      toast.success(`PIN updated for ${pinEditTarget.Name}`);
      setPinEditTarget(null);
      setEditPinValue("");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingPin(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/cashiers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deleteTarget.Name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      toast.success(`${deleteTarget.Name} removed`);
      setDeleteTarget(null);
      onRefresh();
      void loadAccess();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const isHidden = (name: string) => Boolean(access?.staff.find((person) => person.Name === name)?.Hidden);
  const shownCashiers = cashiers.filter((cashier) => staffInView(view, { removed: false, hidden: isHidden(cashier.Name), online: isReallyOnline(cashier) }));
  const showRemoved = view === "removed" || view === "all";

  return (
    <Box sx={styles.manage}>
      <Box sx={styles.manageHeader}>
        <Typography variant="overline" color="text.secondary">
          {view === "removed"
            ? `${access?.removed.length ?? 0} removed`
            : view === "online"
              ? `${shownCashiers.length} signed in now`
              : view === "hidden"
                ? `${shownCashiers.length} hidden`
              : `${shownCashiers.length} registered user${shownCashiers.length !== 1 ? "s" : ""}`}
        </Typography>
        <Button
          size="small"
          variant={showForm ? "outlined" : "contained"}
          color={showForm ? "inherit" : "primary"}
          startIcon={showForm ? <X size={14} /> : <Plus size={14} />}
          onClick={() => {
            setShowForm((v) => !v);
            setNewName("");
            setNewPasscode("");
          }}
        >
          {showForm ? "Cancel" : "New User"}
        </Button>
      </Box>

      {showForm && (
        <Paper variant="outlined" sx={styles.formCard}>
          <Typography variant="overline" color="text.secondary" sx={[styles.block, styles.dialogText]}>
            Add New Cashier / User
          </Typography>
          <Box sx={styles.formFields}>
            <TextField
              placeholder="Full name (e.g. Amara Okafor)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={creating}
              autoFocus
              sx={styles.formName}
              slotProps={{ htmlInput: { "aria-label": "Full name" } }}
            />
            <TextField
              placeholder="PIN (e.g. 1234)"
              value={newPasscode}
              onChange={(e) => setNewPasscode(digitsOnly(e.target.value))}
              disabled={creating}
              type="text"
              sx={styles.formPin}
              slotProps={{ htmlInput: { ...pinInputProps, "aria-label": "4-digit PIN" } }}
            />
            <Button variant="contained" onClick={handleCreate} disabled={!newName.trim() || !PIN_PATTERN.test(newPasscode) || creating} sx={styles.formSubmit}>
              {creating ? <CircularProgress size={16} color="inherit" /> : "Add User"}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Every cashier needs a 4-digit PIN. They select their name and type it to open their dashboard.
          </Typography>
        </Paper>
      )}

      {access && view !== "removed" && (
        <Paper variant="outlined" sx={styles.rulesCard}>
          <Box sx={styles.grow}>
            <Typography variant="caption" sx={styles.rulesLabel}>Sign-in rules</Typography>
            <Typography variant="h6" component="p">One device per cashier</Typography>
            <Typography variant="caption" color="text.secondary">
              When a cashier signs in on a new device, their other devices are signed out.
            </Typography>
          </Box>
          <Switch
            checked={access.single_session}
            onChange={(_, value) => void handleSingleSession(value)}
            slotProps={{ input: { "aria-label": "One device per cashier" } }}
          />
        </Paper>
      )}

      {view === "removed" ? null : shownCashiers.length === 0 ? (
        <Paper variant="outlined" sx={styles.empty}>
          <Box sx={styles.emptyIcon}><Users size={36} /></Box>
          <Typography variant="h6" color="text.secondary">{cashiers.length === 0 ? "No users registered yet" : view === "hidden" ? "Nobody is hidden" : view === "online" ? "Nobody is signed in right now" : "Nobody to show here"}</Typography>
          <Typography variant="caption" color="text.disabled">
            {cashiers.length === 0 ? 'Tap "New User" above to add your first cashier.' : 'Choose "Active staff" or "All staff" to see more.'}
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={styles.card}>
          {shownCashiers.map((cashier) => {
            const isOnline = isReallyOnline(cashier);
            const hasPin = Boolean(cashier.HasPasscode || cashier.Passcode);
            const devices = access?.staff.find((person) => person.Name === cashier.Name)?.Devices ?? 0;
            return (
              <Box key={cashier.Name} sx={styles.userRow}>
                <Box sx={[styles.avatar, styles.avatarSmall, { bgcolor: avatarBg(cashier.Name) }]}>{initials(cashier.Name)}</Box>

                <Box sx={styles.grow}>
                  <Box sx={styles.nameRow}>
                    <Typography variant="h6" component="span" sx={styles.ellipsis}>{cashier.Name}</Typography>
                    {isHidden(cashier.Name) && <Box component="span" sx={styles.hiddenTag}>Hidden</Box>}
                    <Box component="span" sx={[styles.pill, isOnline ? styles.pillOnline : styles.pillOffline]}>
                      {isOnline ? (
                        <>
                          <Box component="span" sx={styles.dot} />
                          Online
                        </>
                      ) : (
                        <>
                          <UserX size={10} />
                          Offline
                        </>
                      )}
                    </Box>
                  </Box>
                  <Box sx={styles.userMeta}>
                    <Clock size={12} />
                    <Typography variant="caption" color="text.secondary">
                      {isOnline ? "Active now" : `Last seen: ${lastSeenLabel(cashier)}`}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">|</Typography>
                    <Typography variant="caption" component="span" sx={hasPin ? styles.pinSet : styles.pinNone}>
                      PIN: {hasPin ? "Configured" : "None set"}
                    </Typography>
                  </Box>
                  {access && devices > 0 && (
                    <Box sx={styles.sessionRow}>
                      <Typography variant="caption" color="text.secondary">
                        Signed in on {devices} device{devices !== 1 ? "s" : ""}
                      </Typography>
                      <Button
                        size="small"
                        color="inherit"
                        sx={styles.signOutButton}
                        disabled={signingOut === cashier.Name}
                        onClick={() => void handleSignOut(cashier.Name)}
                        aria-label={`Sign ${cashier.Name} out of ${devices === 1 ? "their device" : "all devices"}`}
                      >
                        {devices === 1 ? "Sign out" : "Sign out all"}
                      </Button>
                    </Box>
                  )}
                </Box>

                <IconButton
                  size="small"
                  onClick={() => {
                    setPinEditTarget(cashier);
                    setEditPinValue("");
                  }}
                  aria-label={`Change PIN for ${cashier.Name}`}
                  title="Change PIN"
                  sx={styles.pinAction}
                >
                  <KeyRound size={16} />
                </IconButton>

                {access && (
                  <IconButton
                    size="small"
                    onClick={() => void handleHide(cashier.Name, !isHidden(cashier.Name))}
                    aria-label={isHidden(cashier.Name) ? `Show ${cashier.Name} in the staff lists` : `Hide ${cashier.Name} from the staff lists`}
                    title={isHidden(cashier.Name) ? "Show in staff lists" : "Hide from staff lists"}
                    sx={styles.hideAction}
                  >
                    {isHidden(cashier.Name) ? <Eye size={16} /> : <EyeOff size={16} />}
                  </IconButton>
                )}

                <IconButton
                  size="small"
                  onClick={() => setDeleteTarget(cashier)}
                  aria-label={`Remove ${cashier.Name}`}
                  sx={styles.removeAction}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Box>
            );
          })}
        </Paper>
      )}

      {access && view === "removed" && access.removed.length === 0 && (
        <Paper variant="outlined" sx={styles.empty}>
          <Box sx={styles.emptyIcon}><Users size={36} /></Box>
          <Typography variant="h6" color="text.secondary">No removed staff</Typography>
        </Paper>
      )}

      {access && showRemoved && access.removed.length > 0 && (
        <>
          <Typography variant="overline" sx={styles.sectionHeading}>
            Removed staff ({access.removed.length})
          </Typography>
          <Paper variant="outlined" sx={styles.card}>
            {access.removed.map((person) => (
              <Box key={person.StaffId} sx={styles.userRow}>
                <Box sx={[styles.avatar, styles.avatarSmall, styles.removedAvatar, { bgcolor: avatarBg(person.Name) }]}>{initials(person.Name)}</Box>
                <Box sx={styles.grow}>
                  <Typography variant="h6" component="p" sx={styles.ellipsis}>{person.Name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Removed {removedOn(person.RemovedAt)} · cannot sign in
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<RotateCcw size={14} />}
                  onClick={() => {
                    setRestoreTarget(person);
                    setRestorePin("");
                  }}
                  aria-label={`Restore ${person.Name}`}
                >
                  Restore
                </Button>
              </Box>
            ))}
          </Paper>
        </>
      )}

      <Box sx={styles.note}>
        <Box sx={styles.noteIcon}><ShieldCheck size={16} /></Box>
        <Typography variant="caption">
          Removing a user only deletes their login access, and you can restore them later. All sales they logged remain in the records.
        </Typography>
      </Box>

      <Dialog open={!!pinEditTarget} onClose={() => setPinEditTarget(null)} slotProps={{ paper: { sx: styles.dialogPaper } }}>
        <DialogContent sx={styles.dialogContent}>
          <Box sx={[styles.dialogIcon, styles.dialogIconWarning]}><KeyRound size={20} /></Box>
          <DialogTitle sx={styles.dialogTitle}>Change PIN for {pinEditTarget?.Name}</DialogTitle>
          <DialogContentText sx={styles.dialogText}>
            Enter a new 4-digit PIN. Every cashier needs a PIN to log in, so it cannot be left empty.
          </DialogContentText>
          <TextField
            placeholder="Enter 4-Digit PIN (e.g. 1234)"
            value={editPinValue}
            onChange={(e) => setEditPinValue(digitsOnly(e.target.value))}
            type="text"
            disabled={updatingPin}
            autoFocus
            fullWidth
            sx={styles.pinInput}
            slotProps={{ htmlInput: { ...pinInputProps, "aria-label": "New 4-digit PIN" } }}
          />
        </DialogContent>
        <DialogActions sx={styles.dialogActions}>
          <Button variant="outlined" color="inherit" onClick={() => setPinEditTarget(null)} disabled={updatingPin}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleUpdatePin} disabled={updatingPin || !PIN_PATTERN.test(editPinValue)}>
            {updatingPin ? <CircularProgress size={16} color="inherit" /> : "Save PIN"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)} slotProps={{ paper: { sx: styles.dialogPaper } }}>
        <DialogContent sx={styles.dialogContent}>
          <Box sx={[styles.dialogIcon, styles.dialogIconWarning]}><RotateCcw size={20} /></Box>
          <DialogTitle sx={styles.dialogTitle}>Restore {restoreTarget?.Name}?</DialogTitle>
          <DialogContentText sx={styles.dialogText}>
            They can sign in again once you set a new 4-digit PIN. Their old PIN will not work.
          </DialogContentText>
          <TextField
            placeholder="New 4-digit PIN (e.g. 1234)"
            value={restorePin}
            onChange={(e) => setRestorePin(digitsOnly(e.target.value))}
            type="text"
            disabled={restoring}
            autoFocus
            fullWidth
            sx={styles.pinInput}
            slotProps={{ htmlInput: { ...pinInputProps, "aria-label": "New 4-digit PIN" } }}
          />
        </DialogContent>
        <DialogActions sx={styles.dialogActions}>
          <Button variant="outlined" color="inherit" onClick={() => setRestoreTarget(null)} disabled={restoring}>Cancel</Button>
          <Button variant="contained" onClick={handleRestore} disabled={restoring || !PIN_PATTERN.test(restorePin)}>
            {restoring ? <CircularProgress size={16} color="inherit" /> : "Restore"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} slotProps={{ paper: { sx: styles.dialogPaper } }}>
        <DialogContent sx={styles.dialogContent}>
          <Box sx={[styles.dialogIcon, styles.dialogIconError]}><Trash2 size={20} /></Box>
          <DialogTitle sx={styles.dialogTitle}>Remove {deleteTarget?.Name}?</DialogTitle>
          <DialogContentText>
            This removes their login access and signs them out. Their sales history will not be affected, and you can restore them later.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={styles.dialogActions}>
          <Button variant="outlined" color="inherit" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={16} color="inherit" /> : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
