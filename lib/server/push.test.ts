import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createPush, pushEndpoint } from './push';

const owner = '00000000-0000-4000-8000-000000000001';
const cashier = '00000000-0000-4000-8000-000000000002';
const good = 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz';
beforeEach(() => { vi.stubEnv('PUSH_VAPID_PUBLIC_KEY', 'public'); vi.stubEnv('PUSH_VAPID_PRIVATE_KEY', 'private'); vi.stubEnv('PUSH_VAPID_SUBJECT', 'mailto:owner@example.test'); });
afterEach(() => vi.unstubAllEnvs());

it('only accepts the big push services', () => {
  expect(pushEndpoint(good)).toBe(good);
  expect(pushEndpoint('https://web.push.apple.com/QWxs')).not.toBeNull();
  expect(pushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).not.toBeNull();
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example.test/x', 'https://fcm.googleapis.com.evil.test/x', 'not a url', 42, null]) expect(pushEndpoint(bad)).toBeNull();
});

it('saves a phone under the signed-in person and refuses an unsupported address, missing keys or an unset server', async () => {
  const call = vi.fn().mockResolvedValue({ id: 'd1', subscribed: true });
  const push = createPush(call, vi.fn());
  await push.subscribe({ staffId: cashier }, { endpoint: good, keys: { p256dh: 'k'.repeat(30), auth: 'a'.repeat(12) }, label: 'Ada’s phone', actor_id: 'spoof' });
  expect(call).toHaveBeenCalledWith('api_push_subscribe', expect.any(String), expect.objectContaining({ actor_id: cashier, endpoint: good, label: 'Ada’s phone' }));
  await expect(push.subscribe({ staffId: cashier }, { endpoint: 'https://evil.example.test/x?secret=1', keys: { p256dh: 'k', auth: 'a' } })).rejects.toMatchObject({ status: 400, message: 'This phone’s alert address is not supported (evil.example.test).' });
  await expect(push.subscribe({ staffId: cashier }, { endpoint: good, keys: {} })).rejects.toMatchObject({ status: 400 });
  vi.stubEnv('PUSH_VAPID_PRIVATE_KEY', '');
  await expect(push.subscribe({ staffId: cashier }, { endpoint: good, keys: { p256dh: 'k', auth: 'a' } })).rejects.toMatchObject({ status: 503, code: 'PUSH_NOT_CONFIGURED' });
});

it('sends each waiting alert to each phone, reports what happened, and forgets phones that are gone', async () => {
  const items = [{ id: 'i1', title: 'Needs your approval', body: 'Ada: Zed Events (sale)', url: '/bom03/approvals', kind: 'approval_waiting', targets: [
    { id: 't1', endpoint: good, p256dh: 'p', auth: 'a' }, { id: 't2', endpoint: good + '2', p256dh: 'p', auth: 'a' }, { id: 't3', endpoint: good + '3', p256dh: 'p', auth: 'a' }] },
  { id: 'i2', title: 'Approved', body: 'Zed Events (sale) was approved', url: '/cashier', kind: 'approval_decided', targets: [{ id: 't4', endpoint: good + '4', p256dh: 'p', auth: 'a' }] }];
  const call = vi.fn().mockImplementation(async (method: string) => (method === 'api_push_claim' ? items : {}));
  const send = vi.fn().mockImplementation(async (target: { id: string }) => {
    if (target.id === 't2') throw Object.assign(new Error('gone'), { statusCode: 410 });
    if (target.id === 't4') throw Object.assign(new Error('push service down'), { statusCode: 503 });
  });
  const result = await createPush(call, send).dispatch(owner);
  expect(result).toEqual({ sent: 2, failed: 1 });
  expect(JSON.parse(send.mock.calls[0][1])).toEqual({ title: 'Needs your approval', body: 'Ada: Zed Events (sale)', url: '/bom03/approvals', tag: 'i1' });
  expect(call).toHaveBeenCalledWith('api_push_claim', '', { owner_id: owner, batch: 20 });
  expect(call).toHaveBeenLastCalledWith('api_push_report', '', { results: [
    { id: 'i1', delivered: 2, delivered_to: ['t1', 't3'], gone: ['t2'], error: '' },
    { id: 'i2', delivered: 0, delivered_to: [], gone: [], error: 'push service down' }] });
});

it('does nothing when phone alerts are not set up or the owner is unknown', async () => {
  const call = vi.fn();
  expect(await createPush(call, vi.fn()).dispatch(undefined)).toEqual({ sent: 0, failed: 0 });
  vi.stubEnv('PUSH_VAPID_PRIVATE_KEY', '');
  expect(await createPush(call, vi.fn()).dispatch(owner)).toEqual({ sent: 0, failed: 0 });
  expect(call).not.toHaveBeenCalled();
});

it('validates alert switches and removing a phone', async () => {
  const call = vi.fn().mockResolvedValue({});
  const push = createPush(call, vi.fn());
  await push.savePreference({ staffId: owner }, { kind: 'stock_low', enabled: false });
  expect(call).toHaveBeenCalledWith('api_push_preference_save', expect.any(String), { actor_id: owner, kind: 'stock_low', enabled: false });
  await expect(push.savePreference({ staffId: owner }, { kind: 'other', enabled: true })).rejects.toMatchObject({ status: 400 });
  await expect(push.savePreference({ staffId: owner }, { kind: 'stock_low', enabled: 'yes' })).rejects.toMatchObject({ status: 400 });
  await expect(push.unsubscribe({ staffId: owner }, {})).rejects.toMatchObject({ status: 400 });
  await push.unsubscribe({ staffId: owner }, { endpoint: good });
  expect(call).toHaveBeenLastCalledWith('api_push_unsubscribe', expect.any(String), { actor_id: owner, endpoint: good });
});
