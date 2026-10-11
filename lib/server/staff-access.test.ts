import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { signToken } from '../auth-utils';

const state = vi.hoisted(() => ({ values: new Map<string, string>(), service: {
  overview: vi.fn(), signOut: vi.fn(), manage: vi.fn(), setSingleSession: vi.fn() } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => {
  const value = state.values.get(name); return value ? { value } : undefined; } }) }));
vi.mock('./postgres-auth', async importOriginal => {
  const actual = await importOriginal<typeof import('./postgres-auth')>();
  return { ...actual, postgresAuth: state.service };
});
import { postgresStaffAccessChange, postgresStaffAccessOverview } from './postgres-auth-routes';
import { AuthError } from './postgres-auth';
const post = (data: unknown) => new Request('https://app.example.test/api/cashiers/access', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks(); state.values.clear();
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-that-is-not-a-real-key');
  vi.stubEnv('ADMIN_EMAIL', 'owner@example.test');
});
afterEach(() => vi.unstubAllEnvs());
const asAdmin = async () => state.values.set('admin_session', await signToken({ role: 'admin', email: 'owner@example.test' }));

it('keeps the overview and every change behind a verified admin', async () => {
  expect((await postgresStaffAccessOverview()).status).toBe(403);
  for (const action of ['sign_out', 'restore', 'single_session'])
    expect((await postgresStaffAccessChange(post({ action, name: 'A', passcode: '1234', enabled: true }))).status).toBe(403);
  state.values.set('cashier_session', await signToken({ role: 'cashier', staffId: 'x', name: 'A', authBackend: 'postgres', sessionToken: 'x' }));
  expect((await postgresStaffAccessOverview()).status).toBe(403);
  expect(Object.values(state.service).every(fn => fn.mock.calls.length === 0)).toBe(true);
});

it('returns the overview without caching', async () => {
  await asAdmin();
  state.service.overview.mockResolvedValue({ single_session: false, staff: [], removed: [] });
  const response = await postgresStaffAccessOverview();
  expect(await response.json()).toEqual({ data: { single_session: false, staff: [], removed: [] } });
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('signs out, restores and switches the rule with the admin identity attached', async () => {
  await asAdmin();
  state.service.signOut.mockResolvedValue(2);
  expect(await (await postgresStaffAccessChange(post({ action: 'sign_out', name: 'Amaka' }))).json()).toEqual({ success: true, signedOut: 2 });
  expect(state.service.signOut).toHaveBeenCalledWith('Amaka', 'owner@example.test');
  state.service.manage.mockResolvedValue('id');
  expect((await postgresStaffAccessChange(post({ action: 'restore', name: 'Bisi', passcode: '1234' }))).status).toBe(200);
  expect(state.service.manage).toHaveBeenCalledWith('restore', 'Bisi', '1234', 'owner@example.test');
  state.service.setSingleSession.mockResolvedValue(true);
  expect(await (await postgresStaffAccessChange(post({ action: 'single_session', enabled: true }))).json()).toEqual({ success: true, singleSession: true });
  expect(state.service.setSingleSession).toHaveBeenCalledWith(true, 'owner@example.test');
});

it('rejects unknown actions and passes service errors through safely', async () => {
  await asAdmin();
  expect((await postgresStaffAccessChange(post({ action: 'delete_everything' }))).status).toBe(400);
  state.service.signOut.mockRejectedValue(new AuthError('Staff account not found.', 404));
  expect((await postgresStaffAccessChange(post({ action: 'sign_out', name: 'Ghost' }))).status).toBe(404);
  state.service.manage.mockRejectedValue(new Error('postgres://secret@host'));
  const response = await postgresStaffAccessChange(post({ action: 'restore', name: 'Bisi', passcode: '1234' }));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('secret');
});

it('validates input in the service before touching the database', async () => {
  const call = vi.fn().mockResolvedValue(1);
  const { signOut, setSingleSession, manage } = (await vi.importActual<typeof import('./postgres-auth')>('./postgres-auth')).createPostgresAuth(call);
  await expect(signOut('', 'a')).rejects.toMatchObject({ status: 400 });
  await expect(setSingleSession('yes', 'a')).rejects.toMatchObject({ status: 400 });
  await expect(manage('restore', 'Bisi', '12', 'a')).rejects.toMatchObject({ status: 400 });
  expect(call).not.toHaveBeenCalled();
  await signOut(' Amaka ', 'a');
  expect(call).toHaveBeenCalledWith('auth_sign_out_staff', ['Amaka', 'a']);
  call.mockRejectedValueOnce(Object.assign(new Error('x'), { code: '22023' }));
  await expect(signOut('Ghost', 'a')).rejects.toMatchObject({ status: 404 });
});

it('never lists the owner accounting identity as staff', async () => {
  const owner = '00000000-0000-4000-8000-0000000000aa', ada = '00000000-0000-4000-8000-0000000000bb';
  vi.stubEnv('SUPABASE_ADMIN_STAFF_ID', owner.toUpperCase());
  const call = vi.fn().mockImplementation(async (name: string) => name === 'auth_list_staff'
    ? [{ Name: 'Owner', StaffId: owner }, { Name: 'Ada', StaffId: ada }]
    : { single_session: false, staff: [{ Name: 'Owner', StaffId: owner }, { Name: 'Ada', StaffId: ada }], removed: [{ Name: 'Owner', StaffId: owner }] });
  const service = (await vi.importActual<typeof import('./postgres-auth')>('./postgres-auth')).createPostgresAuth(call);
  expect((await service.list()).map((p) => p.Name)).toEqual(['Ada']);
  const overview = await service.overview();
  expect(overview.staff.map((p) => p.Name)).toEqual(['Ada']);
  expect(overview.removed).toEqual([]);
  vi.unstubAllEnvs();
});
