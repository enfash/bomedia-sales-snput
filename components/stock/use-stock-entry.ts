"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { records } from '@/lib/accounting-records';
import { readPendingAccounting, sendAccountingEntry, type PendingAccountingEntry } from '@/lib/accounting-pending';
import type { PaymentMethodOption, StockEntryDraft, StockMaterial, StockRoll } from '@/lib/stock-forms';

const message = (error: unknown) => (error instanceof Error ? error.message : 'The entry is saved on this device. Retry when connected.');

/**
 * Everything the restock, waste and count forms share: the stock lists, the entry waiting on this device, and saving.
 * An entry is kept on the device with one request ID until the server confirms it, so retrying can never count it twice.
 */
export function useStockEntry(staffId: string | null) {
  const [materials, setMaterials] = useState<StockMaterial[]>([]), [rolls, setRolls] = useState<StockRoll[]>([]), [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [pending, setPending] = useState<PendingAccountingEntry | null>(null);
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const requestId = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const [nextMaterials, nextRolls, nextMethods] = await Promise.all([
      records<StockMaterial>('materials'), records<StockRoll>('inventory'), records<PaymentMethodOption>('payment_methods')]);
    setMaterials(nextMaterials); setRolls(nextRolls); setMethods(nextMethods); setReady(true);
  }, []);

  useEffect(() => {
    if (!staffId) return;
    // Hydrate private device storage after SSR; submissions stay disabled until records load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setPending(readPendingAccounting(localStorage, staffId)); } catch (cause) { setError(message(cause)); return; }
    void reload().catch((cause) => setError(message(cause)));
  }, [staffId, reload]);

  const locked = busy || pending !== null;

  const dispatch = useCallback(async (entry: PendingAccountingEntry, onSaved?: () => void) => {
    if (!navigator.locks) { setError('This browser cannot safely submit entries. Use an updated browser on this device.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await navigator.locks.request(`bomedia-accounting:${entry.staffId}`, async () => {
        await sendAccountingEntry(localStorage, entry);
        setPending(null); requestId.current = null;
        setSuccess(`Saved. ${entry.summary}`);
        onSaved?.();
        try { await reload(); } catch { setError('Saved, but the stock list could not refresh. Refresh before the next entry.'); setReady(false); }
      });
    } catch (cause) {
      setError(message(cause));
      try { setPending(staffId ? readPendingAccounting(localStorage, staffId) : null); } catch { setReady(false); }
    } finally { setBusy(false); }
  }, [reload, staffId]);

  /** Sends a checked entry. `onSaved` runs only after the server confirms it. */
  const submit = useCallback((draft: Extract<StockEntryDraft, { ok: true }>, onSaved?: () => void) => {
    if (!staffId || !ready || locked) return;
    requestId.current ??= crypto.randomUUID();
    void dispatch({ version: 1, staffId, operation: draft.operation, requestId: requestId.current, payload: draft.payload, summary: draft.summary }, onSaved);
  }, [staffId, ready, locked, dispatch]);

  const retryPending = useCallback(() => { if (pending) void dispatch(pending); }, [pending, dispatch]);
  const resetRequest = useCallback(() => { requestId.current = null; setSuccess(''); }, []);
  const methodLabel = useCallback((value: string) => methods.find((method) => method.method === value)?.label ?? '…', [methods]);

  return { materials, rolls, methods, ready, busy, pending, locked, error, success, setError, reload, submit, retryPending, resetRequest, methodLabel };
}
export type StockEntryState = ReturnType<typeof useStockEntry>;
