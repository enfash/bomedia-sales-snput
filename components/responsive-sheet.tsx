"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Box, ButtonBase, Dialog, DialogTitle, IconButton, Typography } from "@mui/material";
import { X } from "lucide-react";
import { responsiveSheetStyles as styles } from "@/app/theme";

const COLLAPSED = 55;
const DEFAULT = 82;
const EXPANDED = 96;
const clamp = (height: number) => Math.min(EXPANDED, Math.max(COLLAPSED, height));

/** One mounted dialog across breakpoints. Dragging resizes; it never discards a form. */
export function ResponsiveSheet({ open, onClose, title, description, children, footer, busy = false, maxWidth = "sm" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  maxWidth?: "sm" | "md";
}) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; startY: number; startHeight: number; moved: boolean } | null>(null);
  const height = useRef(DEFAULT);
  const skipClick = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [retained, setRetained] = useState(open);

  function resize(next: number) {
    height.current = clamp(next);
    root.current?.style.setProperty("--sheet-height", `${height.current}%`);
  }

  function settle(next: number) {
    resize(next);
    setExpanded(height.current === EXPANDED);
  }

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const update = () => {
      // visualViewport excludes the on-screen keyboard, unlike vh on many phones.
      root.current?.style.setProperty("--sheet-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      root.current?.style.setProperty("--sheet-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      root.current?.style.setProperty("--sheet-height", `${height.current}%`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    skipClick.current = current.moved;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const nearest = [COLLAPSED, DEFAULT, EXPANDED].reduce((a, b) =>
      Math.abs(b - height.current) < Math.abs(a - height.current) ? b : a);
    settle(nearest);
  }

  return <Dialog ref={root} open={open} keepMounted={retained} fullWidth maxWidth={maxWidth}
    aria-labelledby={titleId}
    onClose={() => { if (!busy) onClose(); }}
    sx={styles.dialog} slotProps={{ paper: { sx: styles.paper }, transition: { onEnter: () => setRetained(true) } }}>
    <ButtonBase aria-label="Resize sheet" aria-expanded={expanded} title="Drag up or down, or tap to resize"
      sx={styles.handle} disabled={busy}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        skipClick.current = false;
        drag.current = { pointer: event.pointerId, startY: event.clientY, startHeight: height.current, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        const delta = current.startY - event.clientY;
        if (Math.abs(delta) > 4) current.moved = true;
        if (current.moved) resize(current.startHeight + delta / (root.current?.clientHeight || 1) * 100);
      }}
      onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
      onClick={() => { if (skipClick.current) { skipClick.current = false; return; } settle(height.current === EXPANDED ? COLLAPSED : EXPANDED); }}
      onKeyDown={event => {
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          settle(event.key === "ArrowUp" || event.key === "End" ? EXPANDED : COLLAPSED);
        }
      }}>
      <Box component="span" sx={styles.handleBar} />
    </ButtonBase>
    <Box sx={styles.header}>
      <Box sx={styles.heading}>
        <DialogTitle id={titleId} sx={styles.title}>{title}</DialogTitle>
        {description && <Typography variant="body2" color="text.secondary">{description}</Typography>}
      </Box>
      <IconButton aria-label={`Close ${title}`} disabled={busy} onClick={onClose}><X size={20} /></IconButton>
    </Box>
    <Box sx={styles.content} onFocusCapture={event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) settle(EXPANDED);
    }}>{children}</Box>
    {footer && <Box sx={styles.footer}>{footer}</Box>}
  </Dialog>;
}
