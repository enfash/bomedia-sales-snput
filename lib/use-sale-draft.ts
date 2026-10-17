"use client";

import { useSyncExternalStore } from "react";
import { DRAFT_EVENT, readDraft } from "@/lib/sale-draft";

function subscribe(onChange: () => void) {
  window.addEventListener(DRAFT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(DRAFT_EVENT, onChange); window.removeEventListener("storage", onChange); };
}

/** True while an unsaved sale is waiting on this phone (the bottom nav shows a dot on New entry). */
export function useSaleDraftWaiting() {
  return useSyncExternalStore(
    subscribe,
    () => { try { return readDraft(window.localStorage) !== null; } catch { return false; } },
    () => false,
  );
}
