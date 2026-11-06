import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined, path: '/cashier' }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useEffect: (effect: () => (() => void) | undefined) => { hooks.cleanup = effect(); } }));
vi.mock('next/navigation', () => ({ usePathname: () => hooks.path }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';
import { NotificationManager } from './notification-manager';
import { useSyncStore } from '@/lib/store';

let revision: number;
let sales: Record<string, unknown>[];
let expenses: Record<string, unknown>[];
let materials: Record<string, unknown>[];
let send: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  hooks.path = '/cashier';
  revision = 1; sales = []; expenses = []; materials = [];
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  storage.setItem('bomedia-muted', 'true');
  send = vi.fn<typeof fetch>(async url => Response.json(url === '/api/accounting/data-revision' ? { revision } :
    { data: url === '/api/sales' ? sales : url === '/api/expenses' ? expenses : url === '/api/materials' ? materials : [] }));
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage, fetch: send }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { onLine: true });
  useSyncStore.setState({ cachedSales: [], cachedExpenses: [], cachedInventory: [], cachedPayments: [], cachedMaterials: [], pendingQueue: [] });
});
afterEach(() => { hooks.cleanup?.(); hooks.cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each(['/cashier/login', '/bom03/login/reset', '/'])('does not poll on %s', async path => {
  hooks.path = path; NotificationManager();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(send).not.toHaveBeenCalled();
});

it('announces the first new sale and expense after an empty baseline and retains current payments', async () => {
  NotificationManager();
  await vi.advanceTimersByTimeAsync(25_000);
  expect(toast.success).not.toHaveBeenCalled();
  const payment = { 'PAYMENT ID': 'confirmed', 'AMOUNT': '100' };
  useSyncStore.setState({ cachedPayments: [payment] });
  revision++;
  sales = [{ _rowIndex: 1, 'CLIENT NAME': 'Test customer', TOTAL: '100', 'INITIAL PAYMENT': '100', 'AMOUNT DIFFERENCES': '0' }];
  expenses = [{ _rowIndex: 1, Amount: '10', Category: 'Transport' }];
  const notified = vi.fn(); window.addEventListener('bomedia-notify', notified);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(toast.success).toHaveBeenCalledTimes(1);
  expect(toast.info).toHaveBeenCalledTimes(1);
  expect(notified).toHaveBeenCalledTimes(1);
  expect(useSyncStore.getState().cachedPayments).toEqual([payment]);
  expect(useSyncStore.getState().cachedSales[0]['AMOUNT DIFFERENCES']).toBe('0');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(toast.success).toHaveBeenCalledTimes(1);
});

it('preserves low-stock alerts after a healthy baseline', async () => {
  materials = [{ 'Material ID': 'm1', 'Material Name': 'Vinyl', 'Total Remaining (ft)': '50', 'Low Stock Threshold (ft)': '20' }];
  NotificationManager(); await vi.advanceTimersByTimeAsync(25_000);
  materials = [{ ...materials[0], 'Total Remaining (ft)': '10' }]; revision++;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(toast.error).toHaveBeenCalledOnce();
  revision++; await vi.advanceTimersByTimeAsync(30_000);
  expect(toast.error).toHaveBeenCalledOnce();
});

it('keeps saved outbox entries during a successful read refresh', async () => {
  const pending = { id: 'frozen-operation', type: 'sale' as const, data: { amountKobo: '10000' }, timestamp: 1 };
  useSyncStore.setState({ pendingQueue: [pending] });
  NotificationManager(); await vi.advanceTimersByTimeAsync(25_000);
  expect(useSyncStore.getState().pendingQueue).toEqual([pending]);
});
