import { after } from 'next/server';
import webpush from 'web-push';

import { callFinancial, type FinancialCall } from './financial-db';
import { FinancialError, validUUID, type FinancialActor } from './financial-service';

export type PushKind = 'approval_waiting' | 'approval_decided' | 'customer_changed' | 'stock_low';
export const PUSH_KINDS: PushKind[] = ['approval_waiting', 'approval_decided', 'customer_changed', 'stock_low'];
type Target = { id: string; endpoint: string; p256dh: string; auth: string };
type Item = { id: string; title: string; body: string; url: string; kind: PushKind; targets: Target[] };
/** Sends one alert to one phone. Throws an error with a `statusCode` when the push service refuses it. */
export type PushSender = (target: Target, payload: string) => Promise<void>;

export const pushConfigured = () => Boolean(process.env.PUSH_VAPID_PUBLIC_KEY && process.env.PUSH_VAPID_PRIVATE_KEY && process.env.PUSH_VAPID_SUBJECT);
export const pushPublicKey = () => process.env.PUSH_VAPID_PUBLIC_KEY ?? '';

// Only the big push services may be written to: a signed-in person cannot make this server call any address they like.
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
/** The host name of an alert address (for example fcm.googleapis.com), or null when it is not a web address. */
export function pushHost(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { return new URL(value).hostname || null; } catch { return null; }
}
// Chrome on some Android phones receives its alerts through Google's own front-end address instead of fcm.googleapis.com. That one host is
// allowed, and only for Google's alert paths, never the rest of google.com.
const GOOGLE_FRONT_END = { host: 'jmt17.google.com', paths: ['/fcm/send/', '/gcm/send/'] };
export function pushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (PUSH_HOSTS.some((host) => host.test(url.hostname))) return url.toString();
    return url.hostname === GOOGLE_FRONT_END.host && GOOGLE_FRONT_END.paths.some((path) => url.pathname.startsWith(path)) ? url.toString() : null;
  } catch { return null; }
}

const invalid = (message: string) => new FinancialError(message, 400, 'INVALID_INPUT');
function mapError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === '42501') throw new FinancialError('Account access is no longer available.', 403, 'ACTOR_DISABLED');
  if (code === '22023' || code === '22P02') throw new FinancialError(error instanceof Error ? error.message : 'That could not be saved.', 409, 'PUSH_REVIEW_REQUIRED');
  throw error;
}

const defaultSender: PushSender = async (target, payload) => {
  webpush.setVapidDetails(process.env.PUSH_VAPID_SUBJECT ?? '', process.env.PUSH_VAPID_PUBLIC_KEY ?? '', process.env.PUSH_VAPID_PRIVATE_KEY ?? '');
  await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, { TTL: 3600, urgency: 'high' });
};

export function createPush(call: FinancialCall = callFinancial, send: PushSender = defaultSender) {
  const ready = () => { if (!pushConfigured()) throw new FinancialError('Phone alerts are not set up on this server yet.', 503, 'PUSH_NOT_CONFIGURED'); };
  const actorId = (actor: FinancialActor) => { if (!validUUID(actor.staffId)) throw new FinancialError('An enabled accounting identity is required.', 403, 'ACTOR_REQUIRED'); return actor.staffId.toLowerCase(); };
  return {
    async subscribe(actor: FinancialActor, input: unknown) {
      ready();
      const body = (input && typeof input === 'object' ? input : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; label?: unknown };
      const endpoint = pushEndpoint(body.endpoint);
      if (!endpoint) {
        // Say which service the phone uses (the host only, never the private part of the address), so an unfamiliar one can be reviewed.
        const host = pushHost(body.endpoint);
        console.warn('Phone alert address refused:', host ?? 'not a valid address');
        throw invalid(`This phone’s alert address is not supported${host ? ` (${host})` : ''}.`);
      }
      if (typeof body.keys?.p256dh !== 'string' || typeof body.keys?.auth !== 'string') throw invalid('This phone’s alert keys are missing.');
      try {
        return await call<{ id: string; subscribed: boolean }>('api_push_subscribe', crypto.randomUUID(), { actor_id: actorId(actor), endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth,
          label: typeof body.label === 'string' ? body.label.slice(0, 100) : 'Phone' });
      } catch (error) { return mapError(error); }
    },
    async unsubscribe(actor: FinancialActor, input: unknown) {
      const body = (input && typeof input === 'object' ? input : {}) as { endpoint?: unknown; deviceId?: unknown };
      const payload: Record<string, unknown> = { actor_id: actorId(actor) };
      if (typeof body.endpoint === 'string' && body.endpoint.length <= 2000) payload.endpoint = body.endpoint;
      else if (validUUID(body.deviceId)) payload.device_id = String(body.deviceId).toLowerCase();
      else throw invalid('Choose the phone to remove.');
      try { return await call<{ removed: number }>('api_push_unsubscribe', crypto.randomUUID(), payload); } catch (error) { return mapError(error); }
    },
    async state(actor: FinancialActor, endpoint: unknown) {
      const state = await call<{ this_phone: boolean; devices: unknown[]; off: PushKind[] }>('api_push_state', '', { actor_id: actorId(actor), endpoint: typeof endpoint === 'string' ? endpoint.slice(0, 2000) : '' });
      return { configured: pushConfigured(), publicKey: pushPublicKey(), ...state };
    },
    async savePreference(actor: FinancialActor, input: unknown) {
      const body = (input && typeof input === 'object' ? input : {}) as { kind?: unknown; enabled?: unknown };
      if (!PUSH_KINDS.includes(body.kind as PushKind) || typeof body.enabled !== 'boolean') throw invalid('Choose an alert and switch it on or off.');
      try { return await call<{ kind: string; enabled: boolean }>('api_push_preference_save', crypto.randomUUID(), { actor_id: actorId(actor), kind: body.kind, enabled: body.enabled }); } catch (error) { return mapError(error); }
    },
    /** Queues a test alert to the person asking; it is sent a moment later like any other. */
    async sendTest(actor: FinancialActor, home: string) {
      ready();
      try { return await call<{ queued: number }>('api_push_test', crypto.randomUUID(), { actor_id: actorId(actor), url: home }); } catch (error) { return mapError(error); }
    },
    /** Sends every alert that is waiting. `owner` is the owner's staff id (the database does not know who the owner is). */
    async dispatch(owner: string | undefined, batch = 20) {
      if (!pushConfigured() || !validUUID(owner)) return { sent: 0, failed: 0 };
      const items = await call<Item[]>('api_push_claim', '', { owner_id: String(owner).toLowerCase(), batch });
      let sent = 0, failed = 0;
      const results = [];
      for (const item of items) {
        const payload = JSON.stringify({ title: item.title, body: item.body, url: item.url, tag: item.id });
        const deliveredTo: string[] = [], gone: string[] = []; let error = '';
        for (const target of item.targets) {
          try { await send(target, payload); deliveredTo.push(target.id); }
          catch (cause) {
            const status = (cause as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.push(target.id); else error = cause instanceof Error ? cause.message : 'The push service refused it.';
          }
        }
        sent += deliveredTo.length; failed += item.targets.length - deliveredTo.length - gone.length;
        results.push({ id: item.id, delivered: deliveredTo.length, delivered_to: deliveredTo, gone, error: deliveredTo.length + gone.length < item.targets.length ? error || 'Temporary delivery failure' : '' });
      }
      if (results.length) await call('api_push_report', '', { results });
      return { sent, failed };
    },
  };
}
export const push = createPush();

// Alerts go out right after whatever created them. On Vercel the server can freeze as soon as it has answered, so the send is handed to Next's
// `after()`, which keeps it running until it finishes. Outside a request (scripts, tests) `after()` is not available, so a short timer is used.
type AfterResponse = (task: () => Promise<void> | void) => void;

export function createDispatchQueue(run: () => Promise<unknown>, afterResponse: AfterResponse = after, delayMs = 800) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = () => run().then(() => undefined, (error) => console.warn('Phone alerts could not be sent:', error instanceof Error ? error.message : error));
  return function queue() {
    try { afterResponse(send); return; } catch { /* not inside a request: fall back to the timer */ }
    if (timer) return;
    timer = setTimeout(() => { timer = undefined; void send(); }, delayMs);
    timer.unref?.();
  };
}

const queue = createDispatchQueue(() => push.dispatch(process.env.SUPABASE_ADMIN_STAFF_ID));
export function queueDispatch() {
  if (pushConfigured()) queue();
}
