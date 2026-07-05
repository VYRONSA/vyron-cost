"use client";

import { RefreshCw, Wifi, WifiOff, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaNoticeTone = "info" | "success" | "warning";

type PwaNotice = {
  id: string;
  tone: PwaNoticeTone;
  text: string;
};

const SW_PATH = "/sw.js";

function toneClass(tone: PwaNoticeTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-700";
}

export default function PwaRuntime() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [online, setOnline] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [notices, setNotices] = useState<PwaNotice[]>([]);

  const showInstall = Boolean(deferredPrompt);

  const installHint = useMemo(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/iPad|iPhone|iPod/i.test(ua)) {
      return "Install on iOS: Share > Add to Home Screen";
    }
    return "Install app";
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;

    setOnline(navigator.onLine);

    function onOnline() {
      setOnline(true);
      pushNotice({ id: `online-${Date.now()}`, tone: "success", text: "Back online. Live data has resumed." });
    }

    function onOffline() {
      setOnline(false);
      pushNotice({ id: `offline-${Date.now()}`, tone: "warning", text: "You are offline. Static assets remain available." });
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      setDeferredPrompt(null);
      pushNotice({ id: `installed-${Date.now()}`, tone: "success", text: "VYRON COST installed successfully." });
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let mounted = true;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/", updateViaCache: "none" });

        if (!mounted) return;

        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setHasUpdate(true);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(registration.waiting || null);
              setHasUpdate(true);
              pushNotice({ id: `update-${Date.now()}`, tone: "info", text: "An update is ready." });
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });
      } catch {
        pushNotice({ id: `sw-fail-${Date.now()}`, tone: "warning", text: "Offline mode unavailable in this browser session." });
      }
    }

    void register();

    return () => {
      mounted = false;
    };
  }, []);

  function pushNotice(notice: PwaNotice) {
    setNotices((current) => {
      const next = [...current, notice].slice(-3);
      return next;
    });

    window.setTimeout(() => {
      setNotices((current) => current.filter((item) => item.id !== notice.id));
    }, 5200);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.7rem)] z-[90] mx-auto flex w-full max-w-xl flex-col gap-2 px-3"
        role="status"
        aria-live="polite"
      >
        {!online ? (
          <div className="pointer-events-auto rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-700 shadow-[0_10px_30px_rgba(120,53,15,0.15)] backdrop-blur">
            <span className="inline-flex items-center gap-1.5">
              <WifiOff size={14} />
              Offline mode active
            </span>
          </div>
        ) : null}

        {notices.map((notice) => (
          <div
            key={notice.id}
            className={`pointer-events-auto rounded-xl border px-3 py-2 text-xs font-semibold shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur ${toneClass(notice.tone)}`}
          >
            {notice.text}
          </div>
        ))}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[95] mx-auto flex w-full max-w-xl justify-center px-3">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-[0_20px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          {showInstall ? (
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D8B24A] bg-[#FFF7E4] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#A87A17]"
              disabled={installing}
            >
              <Download size={14} />
              {installing ? "Installing" : installHint}
            </button>
          ) : null}

          {hasUpdate ? (
            <button
              type="button"
              onClick={applyUpdate}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-700"
            >
              <RefreshCw size={14} />
              Update Ready
            </button>
          ) : (
            <div className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500">
              <Wifi size={13} />
              App shell cached
            </div>
          )}
        </div>
      </div>
    </>
  );
}
