"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useFloatingNotice } from '@/components/floating-notice';
import { APPROVALS_CHANGED } from '@/components/approvals-inbox';
import { setApprovalsCount } from '@/lib/approvals-count';
import { koboNaira, rowTitle, rowTotalKobo, type ApprovalRow } from '@/lib/approvals-view';

const ANNOUNCED = 'bomedia-approvals-announced';
const open = () => { window.location.assign('/bom03/approvals'); };

/** Owner only: keeps the waiting count fresh and floats one notice when a new request arrives. Renders nothing itself. */
export function ApprovalsWatcher() {
  const pathname = usePathname();
  const owner = pathname.startsWith('/bom03') && !pathname.includes('/login');
  const onInbox = pathname.startsWith('/bom03/approvals');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!owner) return;
    let active = true;
    const check = async () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      try {
        const response = await fetch('/api/accounting/approvals', { cache: 'no-store' });
        if (!response.ok) return;
        const result = await response.json();
        if (!active || !Array.isArray(result?.data)) return;
        const waiting = (result.data as ApprovalRow[]).filter((r) => r.status === 'pending');
        setApprovalsCount(waiting.length);
        let announced: string[] = [];
        try { announced = JSON.parse(localStorage.getItem(ANNOUNCED) || '[]'); } catch { /* Announce again rather than miss one. */ }
        const fresh = waiting.filter((r) => !announced.includes(r.id));
        if (!waiting.length) { setText(''); return; }
        if (fresh.length) {
          const first = fresh[0];
          setText(fresh.length === 1
            ? `${first.requested_by ?? 'A cashier'} needs your approval: ${first.operation === 'screen_expense' ? 'expense, ' : first.operation === 'expense_correction' ? 'expense change, ' : first.operation === 'sale_correction' ? 'sale change, ' : ''}${rowTitle(first)}, ${koboNaira(rowTotalKobo(first))}.`
            : `${fresh.length} entries need your approval.`);
          try { localStorage.setItem(ANNOUNCED, JSON.stringify([...announced, ...fresh.map((r) => r.id)].slice(-200))); } catch { /* Not remembered; fine. */ }
        }
      } catch { /* Offline: keep the last count. */ }
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    window.addEventListener(APPROVALS_CHANGED, check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { active = false; clearInterval(timer); window.removeEventListener(APPROVALS_CHANGED, check); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [owner]);

  useFloatingNotice('approvals-new', owner && !onInbox && text ? { tone: 'warning', text, action: { label: 'Review', run: open } } : null);
  return null;
}
