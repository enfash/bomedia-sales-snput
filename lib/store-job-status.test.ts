import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it.each(['postgres', 'sheets'])('queues a board move for %s without rewriting older entries', async backend => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); },
    removeItem: (key: string) => { saved.delete(key); },
  };
  storage.setItem('userName', 'reviewer');
  storage.setItem('bomedia-payment-context-v1', JSON.stringify({
    userName: 'reviewer', backend, staffId: '00000000-0000-4000-8000-000000000001',
  }));
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  const { useSyncStore } = await import('./store');
  const earlier = { id: 'old-request', type: 'sale_status' as const, timestamp: 1,
    data: { saleId: 'BOM-1', rowIndex: 7, jobStatus: 'Ready' } };
  useSyncStore.setState({ pendingQueue: [earlier], cachedSales: [{ 'Sales ID': 'BOM-1', _rowIndex: 7, 'JOB STATUS': 'Ready' }] });
  useSyncStore.getState().updateSaleStatus('BOM-1', 7, 'In Progress');
  const state = useSyncStore.getState();
  expect(state.pendingQueue).toHaveLength(2);
  expect(state.pendingQueue[0]).toEqual(earlier);
  expect(state.pendingQueue[1]).toMatchObject({ version: 2, backend, type: 'sale_status',
    data: { saleId: 'BOM-1', rowIndex: 7, jobStatus: backend === 'postgres' ? 'Finishing' : 'In Progress' } });
  expect(state.cachedSales[0]['JOB STATUS']).toBe(backend === 'postgres' ? 'Finishing' : 'In Progress');
});
