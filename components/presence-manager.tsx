"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 3 * 60 * 1000; // 3 minutes

function patchStatus(name: string, status: "Online" | "Offline", options: { heartbeat?: boolean; keepalive?: boolean } = {}) {
  fetch("/api/cashiers", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, status, heartbeat: options.heartbeat ?? false }),
    keepalive: options.keepalive ?? false,
  }).catch(() => {/* non-blocking */});
}

export function PresenceManager({ isAdmin }: { isAdmin: boolean }) {
  useEffect(() => {
    // Admins don't have a cashier row — nothing to track
    if (isAdmin) return;

    const getName = () => localStorage.getItem("userName") || "";

    const heartbeat = () => {
      const name = getName();
      if (!name) return;
      patchStatus(name, "Online", { heartbeat: true });
    };

    // Send first heartbeat immediately (confirms Online after login/page load)
    heartbeat();

    // Repeat every 3 minutes while the tab is open
    const interval = setInterval(heartbeat, HEARTBEAT_MS);

    // Mark Offline when the browser tab/window is closed or navigated away.
    // keepalive: true tells the browser to finish the request even after the page unloads.
    const handleUnload = () => {
      const name = getName();
      if (!name) return;
      patchStatus(name, "Offline", { keepalive: true });
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [isAdmin]);

  return null;
}
