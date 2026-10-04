import { createHash, randomBytes } from 'node:crypto';
import { hashPin, verifyPin } from './pin-credentials.mjs';
import { signToken, verifyToken } from '../auth-utils';
import { callAuth, type AuthCall } from './auth-db';

export class AuthError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export type StaffSession = { staff_id: string; name: string; session_id: string };
export type StaffSummary = { Name: string; HasPasscode: boolean; RequiresPinReset: boolean; StaffId: string;
  Status: string; 'Last Login': string | null; 'Last Active': string | null };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
// Fixed non-user credential hash allows comparable work for absent/disabled accounts.
const dummyHash = 'scrypt$32768$8$3$00000000000000000000000000000000$' + '00'.repeat(32);

export function createPostgresAuth(call: AuthCall = callAuth) {
  async function login(name: unknown, passcode: unknown) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200
      || typeof passcode !== 'string' || passcode.length > 512) throw new AuthError('Enter your name and PIN.', 400);
    const reserved = await call<{ status: string; ticket?: string; pin_hash?: string | null }>('auth_reserve_login', [normalize(name)]);
    if (reserved.status === 'limited') throw new AuthError('Too many sign-in attempts. Try again in 15 minutes.', 429);
    if (reserved.status !== 'ready' || !reserved.ticket) throw new AuthError('Unable to sign in with those details.', 401);
    const matches = await verifyPin(passcode.trim() || 'invalid-empty-pin', reserved.pin_hash || dummyHash);
    if (!reserved.pin_hash || !matches) throw new AuthError('Unable to sign in with those details. Check your PIN or ask the administrator to reset it.', 401);
    const secret = randomBytes(32).toString('base64url');
    const identity = await call<StaffSession & { status: string }>('auth_claim_session', [reserved.ticket, reserved.pin_hash, digest(secret)]);
    if (identity.status === 'device_required') throw new AuthError('This account requires a registered work device. Device verification must be configured before signing in.', 403);
    if (identity.status !== 'ok') throw new AuthError('Your account changed during sign-in. Please try again.', 401);
    try {
      const token = await signToken({ role: 'cashier', authBackend: 'postgres', staffId: identity.staff_id,
        name: identity.name, sessionToken: secret });
      return { token, name: identity.name };
    } catch (error) {
      await call('auth_revoke_session', [digest(secret)]);
      throw error;
    }
  }
  async function tokenSecret(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    const payload = await verifyToken(token);
    return payload?.role === 'cashier' && payload.authBackend === 'postgres'
      && typeof payload.sessionToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(payload.sessionToken)
      ? payload.sessionToken : null;
  }
  async function session(token: string | undefined) {
    const secret = await tokenSecret(token);
    if (!secret) return null;
    return call<StaffSession | null>('auth_read_session', [digest(secret)]);
  }
  async function logout(token: string | undefined) {
    const secret = await tokenSecret(token);
    if (secret) await call('auth_revoke_session', [digest(secret)]);
  }
  async function presence(token: string | undefined, name: unknown, online: boolean) {
    const identity = await session(token);
    if (!identity) throw new AuthError('Please sign in again. Pending entries are kept on this device.', 401);
    if (typeof name !== 'string' || normalize(name) !== normalize(identity.name)) throw new AuthError('You can update only your own presence.', 403);
    const secret = await tokenSecret(token);
    if (!secret || !await call<boolean>('auth_presence', [digest(secret), online])) throw new AuthError('Please sign in again.', 401);
  }
  async function manage(operation: 'create' | 'reset' | 'disable', name: unknown, pin: unknown, adminIdentity: string) {
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new AuthError('A staff name is required.', 400);
    let encoded: string | null = null;
    if (operation !== 'disable') {
      if (typeof pin !== 'string' || !/^\d{4}$/.test(pin.trim())) throw new AuthError('Enter a 4-digit PIN.', 400);
      encoded = await hashPin(pin.trim());
    }
    try { return await call<string>('auth_manage_staff', [operation, name.trim(), encoded, adminIdentity]); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') throw new AuthError('That staff name already exists, including disabled accounts.', 409);
      if (code === '22023') throw new AuthError('Staff account could not be updated. Check the name.', 400);
      throw error;
    }
  }
  return { login, session, logout, presence, manage,
    list: () => call<StaffSummary[]>('auth_list_staff', []) };
}
export const postgresAuth = createPostgresAuth();
