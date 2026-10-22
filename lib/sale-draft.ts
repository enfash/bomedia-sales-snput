import { cachedPaymentContext } from './payment-outbox';
import type { OrderCartRow } from './order-cart';

// An unsaved sale is kept on this phone so leaving the page (or a refresh) does not lose it. Nothing here is sent anywhere.
export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DRAFT_EVENT = 'bomedia-sale-draft';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SaleDraft = {
  version: typeof DRAFT_VERSION;
  savedAt: number;
  /** The business date when it was saved, so an old draft does not keep an old sale date. */
  savedOn: string;
  meta: { date: string; clientName: string; contact: string; jobStatus: string; initialPayment: string };
  paidBy: string;
  customerId?: string;
  cart: OrderCartRow[];
  loadedQuote: { id: string; number: string; changed: boolean } | null;
  quoteInput: string;
  job: { materialId: string; desc: string; width: string; height: string; qty: string; price: string; unit: 'ft' | 'in' };
  nlText: string;
};

/** Each signed-in person has their own draft on a shared phone. */
export function draftKey(store: Pick<Storage, 'getItem'>) {
  const context = cachedPaymentContext(store);
  return context?.backend === 'postgres' ? `bomedia-sale-draft:v2:postgres:${context.staffId}` : `bomedia-sale-draft:v2:sheets:${store.getItem('userName') || 'owner'}`;
}

/** True when there is nothing worth keeping (the form is as it starts). */
export function isEmptyDraft(draft: SaleDraft) {
  const paid = draft.meta.initialPayment.trim();
  return draft.cart.length === 0 && !draft.meta.clientName.trim() && !draft.meta.contact.trim() && (paid === '' || paid === '0')
    && !draft.job.desc.trim() && !draft.job.width && !draft.job.height && !draft.nlText.trim() && !draft.loadedQuote;
}

const text = (value: unknown) => typeof value === 'string';
function valid(value: unknown): value is SaleDraft {
  const d = value as SaleDraft | null;
  if (!d || typeof d !== 'object' || d.version !== DRAFT_VERSION || typeof d.savedAt !== 'number' || !text(d.savedOn)) return false;
  const m = d.meta, j = d.job;
  if (!m || ![m.date, m.clientName, m.contact, m.jobStatus, m.initialPayment].every(text)) return false;
  if (!j || ![j.materialId, j.desc, j.width, j.height, j.qty, j.price].every(text) || (j.unit !== 'ft' && j.unit !== 'in')) return false;
  if (!text(d.paidBy) || !text(d.quoteInput) || !text(d.nlText) || (d.customerId !== undefined && !text(d.customerId))) return false;
  if (d.loadedQuote !== null && !(d.loadedQuote && text(d.loadedQuote.id) && text(d.loadedQuote.number) && typeof d.loadedQuote.changed === 'boolean')) return false;
  return Array.isArray(d.cart) && d.cart.every((i) => i && typeof i === 'object' && text(i.id) && typeof i.qty === 'number' && typeof i.totalAmount === 'number');
}

/** The saved draft, or null when there is none, it is too old, or it cannot be trusted (it is then removed). */
export function readDraft(store: Store, now = Date.now()): SaleDraft | null {
  try {
    const key = draftKey(store), raw = store.getItem(key);
    if (!raw) return null;
    let draft: unknown = null;
    try { draft = JSON.parse(raw); } catch { /* removed below */ }
    if (!valid(draft) || now - draft.savedAt > DRAFT_MAX_AGE_MS || draft.savedAt - now > 60_000) { store.removeItem(key); return null; }
    return isEmptyDraft(draft) ? null : draft;
  } catch { return null; }
}

/** Saves the draft, or removes it when the form is empty (after a sale is saved, or the person starts fresh). */
export function writeDraft(store: Store, draft: SaleDraft, notify: () => void = announce) {
  try {
    const key = draftKey(store);
    if (isEmptyDraft(draft)) store.removeItem(key); else store.setItem(key, JSON.stringify(draft));
    notify();
  } catch { /* storage full or blocked: the form still works, it just is not kept */ }
}

export function clearDraft(store: Store, notify: () => void = announce) {
  try { store.removeItem(draftKey(store)); notify(); } catch { /* nothing to clear */ }
}

/** The sale date to restore: the saved one on the same day, otherwise today, so an old draft never logs a sale on an old date. */
export function restoredDate(draft: SaleDraft, today: string) {
  return draft.savedOn === today ? draft.meta.date : today;
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRAFT_EVENT));
}

/** On sign-out, remove unsaved personal drafts only; financial outboxes are separate and retained. */
export function purgeSaleDrafts(store: Pick<Storage,'length'|'key'|'removeItem'>) {
  for (let i=store.length-1;i>=0;i--) { const key=store.key(i); if (key?.startsWith('bomedia-sale-draft:')) store.removeItem(key); }
}
