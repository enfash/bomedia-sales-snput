"use client";

import { useEffect } from "react";

export function PWAManager() {
  useEffect(() => {
    // Register Service Worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Service Worker registered with scope:", registration.scope);
          })
          .catch((err) => {
            console.error("Service Worker registration failed:", err);
          });
      });
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
          icon: "/icon-192x192.png", // Ensure this exists or use a generic icon
        });
      }
    };

    window.addEventListener("bomedia-notify" as any, handleNotify);
    return () => window.removeEventListener("bomedia-notify" as any, handleNotify);
  }, []);

  return null;
}

export default PWAManager;
