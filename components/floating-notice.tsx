"use client";

import { useEffect } from 'react';
import { toast } from 'sonner';

export type FloatingNotice = {
  tone: 'warning' | 'error' | 'success';
  text: string;
  /** A button on the notice. `run` must be a stable function (declare it outside the component). */
  action?: { label: string; run: () => void };
};

/**
 * Shows a status message as a floating toast instead of a banner in the page, so it never pushes the layout down.
 * A warning or error stays until the condition clears (pass `null` to remove it); a success fades after a few seconds.
 * The same `id` always updates the same toast, never stacking a second one.
 */
export function useFloatingNotice(id: string, notice: FloatingNotice | null) {
  const text = notice?.text;
  const tone = notice?.tone;
  const label = notice?.action?.label;
  const run = notice?.action?.run;

  useEffect(() => {
    if (!text || !tone) { toast.dismiss(id); return; }
    toast[tone](text, {
      id,
      duration: tone === 'success' ? 7000 : Infinity,
      closeButton: true,
      // Keep the toast open after the button is pressed: the notice goes away by itself once the problem is fixed.
      action: label && run ? { label, onClick: (event) => { event.preventDefault(); run(); } } : undefined,
    });
  }, [id, text, tone, label, run]);

  useEffect(() => () => { toast.dismiss(id); }, [id]);
}
