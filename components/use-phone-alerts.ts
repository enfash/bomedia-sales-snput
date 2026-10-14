"use client";

import { useCallback, useEffect, useState } from 'react';

import { deviceLabel, keyBytes, needsHomeScreen } from '@/lib/phone-alerts-view';

type Device = { id: string; label: string; added: string; last_used: string | null; this_phone: boolean };
type State = { configured: boolean; publicKey: string; this_phone: boolean; devices: Device[]; off: string[] };

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? (await navigator.serviceWorker.register('/sw.js'), navigator.serviceWorker.ready);
}
async function json(response: Response) { return response.json().catch(() => null); }

/** This phone's alert state and the actions on it. `home` is where the test alert opens. */
export function usePhoneAlerts(home: string) {
  const [state, setState] = useState<State | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [homeScreen, setHomeScreen] = useState(false);

  const load = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setHomeScreen(needsHomeScreen(navigator.userAgent, standalone()));
    setPermission(supported() ? Notification.permission : 'unsupported');
    let endpoint = '';
    try { endpoint = supported() ? (await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription())?.endpoint ?? '' : ''; } catch { /* No subscription yet. */ }
    try {
      const response = await fetch(`/api/push/subscription?endpoint=${encodeURIComponent(endpoint)}`, { cache: 'no-store' }), result = await json(response);
      if (response.ok && result) setState(result);
    } catch { /* Offline: the screen says alerts cannot be checked. */ }
    setReady(true);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const turnOn = useCallback(async () => {
    if (!state?.configured || busy) return;
    setBusy(true); setError('');
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') throw new Error('Alerts are blocked for this phone. Allow notifications for BOMedia in the phone or browser settings, then try again.');
      const reg = await registration();
      const subscription = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.publicKey) });
      const response = await fetch('/api/push/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...subscription.toJSON(), label: deviceLabel(navigator.userAgent) }) });
      if (!response.ok) throw new Error((await json(response))?.error || 'Alerts could not be turned on. Try again.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Alerts could not be turned on. Try again.'); }
    finally { setBusy(false); }
  }, [state, busy, load]);

  const turnOff = useCallback(async (deviceId?: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const reg = await navigator.serviceWorker.getRegistration(), subscription = await reg?.pushManager.getSubscription();
      const own = !deviceId || state?.devices.find((d) => d.id === deviceId)?.this_phone;
      const response = await fetch('/api/push/subscription', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(own && subscription ? { endpoint: subscription.endpoint } : { deviceId }) });
      if (!response.ok) throw new Error((await json(response))?.error || 'Alerts could not be turned off. Try again.');
      if (own) await subscription?.unsubscribe();
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Alerts could not be turned off. Try again.'); }
    finally { setBusy(false); }
  }, [busy, state, load]);

  const sendTest = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ home }) });
      if (!response.ok) throw new Error((await json(response))?.error || 'The test alert could not be sent.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The test alert could not be sent.'); }
    finally { setBusy(false); }
  }, [home]);

  const setSwitch = useCallback(async (kind: string, enabled: boolean) => {
    setState((current) => (current ? { ...current, off: enabled ? current.off.filter((k) => k !== kind) : [...current.off.filter((k) => k !== kind), kind] } : current));
    try {
      const response = await fetch('/api/push/preferences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, enabled }) });
      if (!response.ok) throw new Error();
    } catch { setError('That switch could not be saved. Try again.'); void load(); }
  }, [load]);

  return { ready, busy, error, state, permission, homeScreen, supported: typeof window !== 'undefined' && supported(), turnOn, turnOff, sendTest, setSwitch };
}
