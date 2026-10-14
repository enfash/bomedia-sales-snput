"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { isSignInRequired, loginFor, shellVisible } from '@/lib/session-view';

/** Forget what the browser saved of the app's pages and data (so nothing of the business can be seen after sign-out or an ended session). */
export async function clearSavedPages() {
  try { if ('caches' in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key))); } catch { /* Nothing to clear. */ }
}

/**
 * When the server says the person is no longer signed in, take them to the sign-in page, and only that page. Without this the screen they
 * were on stayed up with its menus and the last data it had loaded. Entries waiting to be sent stay on the device and go after sign-in.
 */
export function SessionGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (!shellVisible(pathname)) return;
    const original = window.fetch;
    let leaving = false;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original.apply(window, args);
      if (response.status === 401 && !leaving) {
        const first = args[0], url = typeof first === 'string' ? first : first instanceof URL ? first.href : first.url;
        const target = new URL(url, window.location.origin);
        if (target.origin === window.location.origin && target.pathname.startsWith('/api/') && !target.pathname.startsWith('/api/auth')) {
          void response.clone().json().then(async (body) => {
            if (leaving || !isSignInRequired(response.status, body)) return;
            leaving = true;
            await clearSavedPages();
            window.location.replace(loginFor(window.location.pathname));
          }).catch(() => undefined);
        }
      }
      return response;
    };
    return () => { window.fetch = original; };
  }, [pathname]);
  return null;
}
