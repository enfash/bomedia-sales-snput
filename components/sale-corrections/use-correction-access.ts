"use client";

import { useEffect, useState } from 'react';
import { accessFrom, type CorrectionAccess } from '@/lib/sale-corrections-view';

const CACHE_KEY = 'bomedia-approval-rules';

/** Who may correct or cancel a sale on this device: the owner always, a cashier only when the owner allows it. Null until known. */
export function useCorrectionAccess(): CorrectionAccess | null {
  const [access, setAccess] = useState<CorrectionAccess | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const response = await fetch('/api/accounting/approval-rules?for=entry', { cache: 'no-store' }), result = await response.json();
        if (!response.ok || !Array.isArray(result?.rules)) throw new Error();
        localStorage.setItem(CACHE_KEY, JSON.stringify(result));
        if (active) setAccess(accessFrom(result));
      } catch {
        try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (active) setAccess(accessFrom(saved)); } catch { /* No rules known: no button. */ }
      }
    });
    return () => { active = false; };
  }, []);
  return access;
}
