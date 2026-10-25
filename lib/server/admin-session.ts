// Keeps the owner's app cookie honest. The cookie is our own, so deleting or banning the owner in Supabase would not end it.
// Instead the cookie remembers when Supabase last said "still valid" (`checkedAt`) and carries the refresh token used to ask again.
// Every few minutes the proxy asks; a definite "no" signs the owner out, and "cannot reach Supabase" only keeps them in for a short grace period.
import { signToken } from '../auth-utils';
import { createAdminAuth, adminAuthMode } from './admin-auth';

export const CHECK_EVERY_MS = 5 * 60 * 1000;
/** If Supabase cannot be reached, the owner stays signed in this long after the last good answer, then must sign in again. */
export const GRACE_MS = 30 * 60 * 1000;

type Payload = { role?: string; email?: string; rt?: string; checkedAt?: number; exp?: number } | null | undefined;
export type Verdict = { cookie?: string; revoked?: boolean };

/** Legacy cookies have no refresh token; they are accepted only in password mode. */
const tracked = (payload: Payload): payload is NonNullable<Payload> & { rt: string } => !!payload && payload.role === 'admin' && typeof payload.rt === 'string' && payload.rt.length > 0;
export const needsCheck = (payload: Payload, now = Date.now()) => tracked(payload) && now - (payload.checkedAt ?? 0) >= CHECK_EVERY_MS;
/** True while the last good answer is recent enough to trust without asking again. */
export const withinGrace = (payload: Payload, now = Date.now()) => tracked(payload) ? Number.isFinite(payload.checkedAt) && (payload.checkedAt ?? 0) <= now && now - (payload.checkedAt ?? 0) < GRACE_MS : adminAuthMode() === 'password';

export const ownerCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 7 * 24 * 60 * 60 };

export async function ownerCookie(email: string, refreshToken: string, durationMs?: number) {
  return signToken({ role: 'admin', email, rt: refreshToken, checkedAt: Date.now() }, durationMs);
}

// Share a refresh within this instance. Supabase also permits short reuse and parent-token recovery;
// separate server instances still need deployment-level concurrency verification.
const inflight = new Map<string, Promise<Verdict & { unavailable?: boolean }>>();

export function checkOwner(payload: NonNullable<Payload> & { rt: string }, auth = createAdminAuth()) {
  const running = inflight.get(payload.rt);
  if (running) return running;
  const work = (async () => {
    const result = await auth.refreshSession(payload.rt).catch(() => ({ status: 'unavailable' as const }));
    if (result.status !== 'ok') return result.status === 'revoked' ? { revoked: true } : { unavailable: true };
    const remaining = typeof payload.exp === 'number' ? payload.exp - Date.now() : undefined; // keep the original expiry, do not extend it
    return { cookie: await ownerCookie(payload.email ?? '', result.refreshToken, remaining && remaining > 0 ? remaining : undefined) };
  })().finally(() => setTimeout(() => inflight.delete(payload.rt), 15_000));
  inflight.set(payload.rt, work);
  return work;
}
