// What the phone-alerts screens need to know about the device, and the wording of each alert switch. Pure: no styling, no data access.
export type AlertKind = 'approval_waiting' | 'approval_decided' | 'customer_changed' | 'stock_low';

export const OWNER_ALERTS: { kind: AlertKind; title: string; text: string }[] = [
  { kind: 'approval_waiting', title: 'Waiting for my approval', text: 'A sale, expense, correction or cancellation a cashier asks for' },
  { kind: 'customer_changed', title: 'Customer details changed', text: 'When staff change a phone number, notes or name' },
  { kind: 'stock_low', title: 'Stock running low', text: 'A roll goes low or runs out' },
];
export const CASHIER_ALERTS: { kind: AlertKind; title: string; text: string }[] = [
  { kind: 'approval_decided', title: 'Answers to my requests', text: 'When the owner approves or declines a sale, expense or correction I sent' },
];

/** A short name for this device in the list of phones: "Android · Chrome", "iPhone · Safari", "Computer · Chrome". */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent || '';
  const device = /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android/i.test(ua) ? 'Android' : 'Computer';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /(CriOS|Chrome)\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${device} · ${browser}`;
}

/** An iPhone or iPad only allows alerts for an app opened from the Home Screen. */
export const needsHomeScreen = (userAgent: string, standalone: boolean) => /iPhone|iPad|iPod/i.test(userAgent || '') && !standalone;

/** The browser wants the public key as bytes. */
export function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const raw = atob(padded), out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
