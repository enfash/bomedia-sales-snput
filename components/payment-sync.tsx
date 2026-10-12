"use client";
import { useEffect, useState } from 'react';
import { useFloatingNotice } from '@/components/floating-notice';
import { usePathname, useRouter } from 'next/navigation';
import { deliverPayment, paymentContext, PAYMENT_EVENT, readPaymentOutbox, PAYMENT_PREFIX } from '@/lib/payment-outbox';

const retryPayments = () => window.dispatchEvent(new CustomEvent(PAYMENT_EVENT, { detail: { retry: true } }));

export function PaymentSync() {
  const [message, setMessage] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname.includes('/login')) return;
    let active = true;
    let busy = false;
    let contextLoaded = false;
    const sync = async (event?: Event) => {
      if (busy) return;
      busy = true;
      try {
        const entries = readPaymentOutbox(localStorage);
        if (active) setMessage(entries.length ? `${entries.length} payment(s) saved on this device. ${entries.find(e => e.error)?.error || 'Waiting to sync.'}` : '');
        if (!navigator.onLine || !navigator.locks || (!entries.length && contextLoaded)) return;
        const retryRequested = event instanceof CustomEvent && event.detail?.retry === true;
        const resumeAuth = !contextLoaded || retryRequested;
        const context = await paymentContext();
        contextLoaded = true;
        await navigator.locks.request('bomedia-payment-outbox', async () => {
          let updated = false;
          for (const entry of readPaymentOutbox(localStorage)) {
            if ((entry.state === 'review' && !retryRequested) || (entry.state === 'auth' && !resumeAuth)) continue;
            updated = await deliverPayment(localStorage, entry, context, fetch) || updated;
          }
          const remaining = readPaymentOutbox(localStorage);
          if (active) setMessage(remaining.length ? `${remaining.length} payment(s) saved. ${remaining.find(e => e.error)?.error || 'Waiting to sync.'}` : '');
          if (updated) { window.dispatchEvent(new Event('bomedia-data-changed')); router.refresh(); }
        });
      } catch (error) { if (active) setMessage((error as Error).message); }
      finally { busy = false; }
    };
    const changed = (event: StorageEvent) => { if (event.key?.startsWith(PAYMENT_PREFIX)) void sync(); };
    void sync();
    const interval = setInterval(() => void sync(), 15000);
    window.addEventListener(PAYMENT_EVENT, sync);
    window.addEventListener('online', sync);
    window.addEventListener('storage', changed);
    return () => { active = false; clearInterval(interval); window.removeEventListener(PAYMENT_EVENT, sync); window.removeEventListener('online', sync); window.removeEventListener('storage', changed); };
  }, [pathname, router]);
  useFloatingNotice('payment-pending', message ? { tone: 'warning', text: message, action: { label: 'Retry saved payment', run: retryPayments } } : null);
  return null;
}
