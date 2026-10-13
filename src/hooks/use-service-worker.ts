import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useServiceWorker() {
  const reloadingRef = useRef(false);

  // ── Service Worker registration + auto-update ──────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In dev, unregister any existing SW so HMR is not broken
    if (!import.meta.env.PROD) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;

    // When a new SW takes control, reload so the user always runs latest code.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    });

    // Listen for sync messages from the SW (background-sync callback)
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      if (event.data?.type === "BBV_SYNC_NOW") {
        // Convex reconnects automatically — nothing extra needed.
        // The message is just a hook for future manual sync queues.
      }
    });

    const handleNewWorker = (worker: ServiceWorker) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          // New version installed and waiting — activate immediately.
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    };

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        registration = reg;

        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
          return;
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) handleNewWorker(newWorker);
        });
      })
      .catch((err) => console.warn("Service Worker registration failed:", err));

    // Force an update check every time the user brings the app to foreground
    const checkForUpdate = () => {
      registration?.update().catch(() => {});
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
    window.addEventListener("focus", checkForUpdate);

    const interval = setInterval(checkForUpdate, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);

  // ── Online / offline indicator + background sync registration ─────────────
  useEffect(() => {
    if (!import.meta.env.PROD) return;

    const handleOffline = () => {
      toast.warning("You are offline. Data will sync when you reconnect.", {
        id: "offline",
        duration: Infinity,
      });
    };

    const handleOnline = () => {
      toast.dismiss("offline");
      toast.success("Back online — syncing data...", { duration: 3000 });

      // Register a background sync so the SW notifies all open windows
      navigator.serviceWorker.ready
        .then((reg) => {
          if ("sync" in reg) {
            return (reg as ServiceWorkerRegistration & {
              sync: { register: (tag: string) => Promise<void> };
            }).sync.register("bbv-sync");
          }
        })
        .catch(() => {});
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);
}
