"use client";
// How many sales are waiting for the owner, shared by the bell, the sidebar and the dashboard card.
// One watcher (components/approvals-watcher.tsx) fills it; everything else only reads.
import { useSyncExternalStore } from 'react';

let count = 0;
const listeners = new Set<() => void>();
export function setApprovalsCount(next: number) {
  if (next === count) return;
  count = next;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useApprovalsCount = () => useSyncExternalStore(subscribe, () => count, () => 0);
