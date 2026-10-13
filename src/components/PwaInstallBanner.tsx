import { useState, useEffect } from "react";
import { X, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show in iframes (App Builder preview)
    if (window.self !== window.top) return;

    // Don't show if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const alreadyDismissed = localStorage.getItem("pwa-banner-dismissed");
    if (alreadyDismissed) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
    if (ios) {
      setIsIos(true);
      setShowBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    localStorage.setItem("pwa-banner-dismissed", "1");
  };

  if (!showBanner || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-sidebar text-sidebar-foreground rounded-xl shadow-2xl border border-sidebar-border p-4 flex items-start gap-3">
        <img src="/icon/icon-192.png" alt="BBV Fuel icon" className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Install BBV Fuel</p>
          {isIos ? (
            <p className="text-xs text-sidebar-foreground/70 mt-0.5 leading-relaxed">
              Tap <Share className="inline w-3.5 h-3.5 mx-0.5" /> then{" "}
              <strong>"Add to Home Screen"</strong> to install this app.
            </p>
          ) : (
            <p className="text-xs text-sidebar-foreground/70 mt-0.5">
              Add to your home screen for quick access.
            </p>
          )}
          {!isIos && (
            <Button
              size="sm"
              className="mt-2 h-7 text-xs gap-1.5 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
              onClick={handleInstall}
            >
              <Download className="w-3.5 h-3.5" />
              Install App
            </Button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
