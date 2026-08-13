"use client";

import { useEffect } from "react";

export function PWARegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("Service Worker registered with scope:", registration.scope);
          
          if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
          }
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });

      // Register background sync when the user goes offline
      window.addEventListener("offline", () => {
        if ("SyncManager" in window) {
          navigator.serviceWorker.ready.then((registration) => {
            // @ts-expect-error - TS might not know about sync in standard lib
            registration.sync.register("sync-geoai-alerts")
              .then(() => console.log("Background sync registered for GeoAI alerts"))
              .catch((err: unknown) => console.error("Background sync registration failed:", err));
          });
        }
      });
    }
  }, []);

  return null; // This component doesn't render anything
}
