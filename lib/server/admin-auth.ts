// Owner sign-in through Supabase Auth: email + password, then a 6-digit code from an authenticator app.
// Talks to Supabase's Auth REST API directly with the public (publishable) key, so no extra package and no secret key is needed.
// This only decides WHO the owner is. The app's own `admin_session` cookie is still issued by the login routes.

export class AdminAuthError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

type Env = Record<string, string | undefined>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Factor = { id: string; factor_type?: string; status?: string };
type Pending = { accessToken: string; factorId: string };
export type PasswordStep =
  | (Pending & { step: 'code' })
  | (Pending & { step: 'setup'; qr: string; secret: string });

export const MIN_NEW_PASSWORD = 12;

/** Supabase sends the QR as raw SVG text after "data:image/svg+xml;utf-8,", which many browsers will not draw. Re-encode it so an <img> always can. */
export function qrImageSource(qr: string): string {
  const svg = qr.startsWith('data:') ? decodeURIComponentSafe(qr.slice(qr.indexOf(',') + 1)) : qr;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function decodeURIComponentSafe(value: string) { try { return decodeURIComponent(value); } catch { return value; } }

/** The old environment-password login stays the default until ADMIN_AUTH=supabase is set. */
export function adminAuthMode(env: Env = process.env): 'supabase' | 'password' {
  return env.ADMIN_AUTH === 'supabase' ? 'supabase' : 'password';
}

export function createAdminAuth(env: Env = process.env, fetcher: Fetcher = (input, init) => fetch(input, init)) {
  const ownerEmail = () => env.ADMIN_EMAIL?.trim().toLowerCase() || '';
  function base() {
    const url = env.SUPABASE_URL?.trim().replace(/\/+$/, '') || (env.SUPABASE_PROJECT_REF ? `https://${env.SUPABASE_PROJECT_REF.trim()}.supabase.co` : '');
    const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url || !key || !ownerEmail()) throw new AdminAuthError('Owner sign-in is not set up on this server.', 503);
    return { url: `${url}/auth/v1`, key };
  }
  async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
    const { url, key } = base();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(`${url}${path}`, {
            method: init.method ?? 'POST', signal: controller.signal,
            headers: { apikey: key, 'Content-Type': 'application/json', Authorization: `Bearer ${init.token ?? key}` },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
          });
          const data = await response.json().catch(() => ({})) as T & { error_code?: string; code?: string | number };
          return { status: response.status, data };
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Auth timed out')); }, 5000); }),
      ]);
    } catch { throw new AdminAuthError('Sign-in service is unavailable. Please try again.', 503); }
    finally { clearTimeout(timer); }
  }

  const isOwner = (email: unknown) => typeof email === 'string' && email.trim().toLowerCase() === ownerEmail();

  async function passwordStep(email: unknown, password: unknown): Promise<PasswordStep> {
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || email.length > 320 || password.length > 512) {
      throw new AdminAuthError('Enter your email and password.', 400);
    }
    const result = await call<{ access_token?: string; user?: { email?: string; factors?: Factor[] } }>(
      '/token?grant_type=password', { body: { email: email.trim(), password } });
    if (result.status === 429) throw new AdminAuthError('Too many sign-in attempts. Try again in a few minutes.', 429);
    if (result.status >= 500) throw new AdminAuthError('Sign-in service is unavailable. Please try again.', 503);
    // Same message for a wrong password and for someone who is not the owner, so the page never reveals which emails exist.
    if (result.status !== 200 || !result.data.access_token || !isOwner(result.data.user?.email)) throw new AdminAuthError('Invalid credentials', 401);
    const accessToken = result.data.access_token;
    const totp = (result.data.user?.factors ?? []).filter((factor) => factor.factor_type === 'totp');
    const verified = totp.find((factor) => factor.status === 'verified');
    if (verified) return { step: 'code', accessToken, factorId: verified.id };
    // First time (or an abandoned attempt): clear half-finished setups, then start a fresh one.
    for (const factor of totp) await call(`/factors/${factor.id}`, { method: 'DELETE', token: accessToken });
    const enrolled = await call<{ id?: string; totp?: { qr_code?: string; secret?: string } }>(
      '/factors', { token: accessToken, body: { factor_type: 'totp', friendly_name: `BOMedia owner ${Date.now()}` } });
    if (enrolled.status >= 300 || !enrolled.data.id || !enrolled.data.totp?.qr_code || !enrolled.data.totp.secret) {
      throw new AdminAuthError('Could not start the authenticator setup. Please try again.', 503);
    }
    return { step: 'setup', accessToken, factorId: enrolled.data.id, qr: qrImageSource(enrolled.data.totp.qr_code), secret: enrolled.data.totp.secret };
  }

  /** Confirms the 6-digit code. Returns the owner's email only when Supabase accepts it. */
  async function codeStep(pending: Pending, code: unknown): Promise<{ email: string; refreshToken: string }> {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw new AdminAuthError('Enter the 6-digit code from your authenticator app.', 400);
    const challenge = await call<{ id?: string }>(`/factors/${pending.factorId}/challenge`, { token: pending.accessToken });
    if (challenge.status === 429) throw new AdminAuthError('Too many attempts. Try again in a few minutes.', 429);
    if (challenge.status >= 300 || !challenge.data.id) throw new AdminAuthError('Your sign-in expired. Start again.', 401);
    const verified = await call<{ access_token?: string; refresh_token?: string }>(`/factors/${pending.factorId}/verify`,
      { token: pending.accessToken, body: { challenge_id: challenge.data.id, code: code.trim() } });
    if (verified.status === 429) throw new AdminAuthError('Too many attempts. Try again in a few minutes.', 429);
    if (verified.status >= 300 || !verified.data.access_token || !verified.data.refresh_token) throw new AdminAuthError('That code is not right. Try the newest one.', 401);
    const me = await call<{ email?: string }>('/user', { method: 'GET', token: verified.data.access_token });
    if (me.status !== 200 || !isOwner(me.data.email)) throw new AdminAuthError('Invalid credentials', 401);
    return { email: env.ADMIN_EMAIL!.trim(), refreshToken: verified.data.refresh_token };
  }

  /**
   * Asks Supabase whether this sign-in is still good. 'revoked' means Supabase definitely said no (user deleted or banned,
   * password changed, sessions ended); 'unavailable' means we could not get an answer, which is NOT a reason to sign anyone out.
   */
  async function refreshSession(refreshToken: string): Promise<{ status: 'ok'; refreshToken: string } | { status: 'revoked' | 'unavailable' }> {
    let result;
    try { result = await call<{ refresh_token?: string; user?: { email?: string } }>('/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } }); }
    catch { return { status: 'unavailable' }; }
    if (result.status === 429 || result.status >= 500) return { status: 'unavailable' };
    if (result.status !== 200 || !result.data.refresh_token || !isOwner(result.data.user?.email)) return { status: 'revoked' };
    return { status: 'ok', refreshToken: result.data.refresh_token };
  }

  /** Emails a reset link. Always looks the same from outside, whether or not the email is the owner's. */
  async function requestReset(email: unknown, redirectTo: string) {
    if (!isOwner(email)) return;
    await call(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { body: { email: ownerEmail() } }).catch(() => undefined);
  }

  async function setPassword(recoveryToken: unknown, password: unknown) {
    if (typeof recoveryToken !== 'string' || !recoveryToken) throw new AdminAuthError('This reset link is not valid. Ask for a new one.', 400);
    if (typeof password !== 'string' || password.length < MIN_NEW_PASSWORD || password.length > 512) {
      throw new AdminAuthError(`Use at least ${MIN_NEW_PASSWORD} characters.`, 400);
    }
    const me = await call<{ email?: string }>('/user', { method: 'GET', token: recoveryToken });
    if (me.status !== 200 || !isOwner(me.data.email)) throw new AdminAuthError('This reset link is not valid. Ask for a new one.', 400);
    const changed = await call('/user', { method: 'PUT', token: recoveryToken, body: { password } });
    if (changed.status >= 300) throw new AdminAuthError('Could not change the password. Ask for a new link.', 400);
  }

  return { passwordStep, codeStep, refreshSession, requestReset, setPassword };
}
