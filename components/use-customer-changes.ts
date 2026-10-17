"use client";

import { useCallback, useEffect, useState } from 'react';
import { unseenChanges } from '@/lib/customer-changes-view';
import type { RecentCustomerChange } from '@/lib/server/customers';

const SEEN_KEY = 'bomedia-customer-changes-seen';

/** The owner's recent customer edits by staff, refreshed every minute, and how many are new since the bell was last opened. Empty for everyone else. */
export function useCustomerChanges(enabled: boolean) {
  const [changes, setChanges] = useState<RecentCustomerChange[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/accounting/customer-changes', { cache: 'no-store' }), result = await response.json();
        if (active && response.ok && Array.isArray(result.data)) setChanges(result.data);
      } catch { /* A missed check is retried a minute later. */ }
    };
    void Promise.resolve().then(() => { try { setSeenAt(localStorage.getItem(SEEN_KEY)); } catch { /* No saved time: everything counts as new. */ } return load(); });
    const timer = setInterval(() => void load(), 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [enabled]);
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setSeenAt(now);
    try { localStorage.setItem(SEEN_KEY, now); } catch { /* The count simply returns next time. */ }
  }, []);
  return { changes, unseen: unseenChanges(changes, seenAt), markSeen };
}
