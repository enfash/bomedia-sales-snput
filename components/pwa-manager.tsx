"use client";

import { useEffect } from "react";

export function PWAManager() {
  useEffect(() => {
    // The service worker caches pages cache-first. In development that serves
    // stale screens and races the dev server while it recompiles ("unknown
    // error occurred when fetching the script"), so it is production-only and
    // any worker left over from an earlier dev session is removed.
    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
    } else if ("serviceWorker" in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Service Worker registered with scope:", registration.scope);
          })
          .catch((err) => {
            console.error("Service Worker registration failed:", err);
          });
      };

      if (document.readyState === "complete") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW);
      }
    }

    // Request Notification Permissions
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    // Listen for custom notification events
    const handleNotify = (event: any) => {
      const { title, body } = event.detail || {};
      if (Notification.permission === "granted" && title) {
        new Notification(title, {
          body: body || "",
          icon: "/icon-192.png", // Ensure this exists or use a generic icon
        });
      }
    };

    window.addEventListener("bomedia-notify" as any, handleNotify);
    return () => window.removeEventListener("bomedia-notify" as any, handleNotify);
  }, []);

  return null;
}
