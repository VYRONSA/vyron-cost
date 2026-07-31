"use client";

import { RefreshCw, Wifi, WifiOff, Download } from "lucide-react";
import { usePathname } from "next/navigation";
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
const INSTALL_DISMISS_KEY = "vyron-pwa-install-dismiss-until";
const INSTALL_COMPLETE_KEY = "vyron-pwa-installed";
const MIN_INTERACTIONS = 3;
const MIN_AUTH_MS_BEFORE_PROMPT = 20000;

function toneClass(tone: PwaNoticeTone) {
  if (tone === "success") return "border-violet-200 bg-violet-50 text-violet-700";
  if (tone === "warning") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  return "border-slate-200 bg-white text-slate-700";
}

export default function PwaRuntime() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [online, setOnline] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [notices, setNotices] = useState<PwaNotice[]>([]);
  const [interactionCount, setInteractionCount] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authSince, setAuthSince] = useState<number | null>(null);
  const [dismissUntil, setDismissUntil] = useState(0);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const isAuthRoute = pathname === "/login" || pathname === "/developer-login" || pathname === "/landing";

  const canShowInstall = Boolean(
    deferredPrompt &&
      !isInstalled &&
      !isStandalone &&
      !isAuthRoute &&
      isAuthenticated &&
      interactionCount >= MIN_INTERACTIONS &&
      authSince !== null &&
      Date.now() - authSince >= MIN_AUTH_MS_BEFORE_PROMPT &&
      Date.now() >= dismissUntil
  );

  const showInstall = canShowInstall;

  const showBottomBar = hasUpdate || showInstall;

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
    if (typeof window === "undefined") return;

    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standalone));
    setIsInstalled(Boolean(standalone || window.localStorage.getItem(INSTALL_COMPLETE_KEY) === "1"));

    const persistedDismiss = Number(window.localStorage.getItem(INSTALL_DISMISS_KEY) || "0");
    if (!Number.isNaN(persistedDismiss)) {
      setDismissUntil(persistedDismiss);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadWorkspaceStatus() {
      try {
        const response = await fetch("/api/workspace/status", { credentials: "include", cache: "no-store" });
        const data = await response.json().catch(() => null);
        const authenticated = Boolean(data?.ok && (data?.hasWorkspaceSession || data?.hasSessionCookie || data?.hasWorkspaceCookie));
        if (!active) return;

        setIsAuthenticated(authenticated);
        setAuthSince((current) => {
          if (!authenticated) return null;
          return current || Date.now();
        });
      } catch {
        if (!active) return;
        setIsAuthenticated(false);
        setAuthSince(null);
      }
    }

    void loadWorkspaceStatus();
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function markInteraction() {
      if (!isAuthenticated || isAuthRoute) return;
      setInteractionCount((current) => Math.min(current + 1, 10));
    }

    window.addEventListener("click", markInteraction);
    window.addEventListener("touchstart", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("scroll", markInteraction, { passive: true });

    return () => {
      window.removeEventListener("click", markInteraction);
      window.removeEventListener("touchstart", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("scroll", markInteraction);
    };
  }, [isAuthRoute, isAuthenticated]);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      setDeferredPrompt(null);
      setIsInstalled(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INSTALL_COMPLETE_KEY, "1");
      }
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
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        dismissInstallForThirtyDays();
      }
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  function dismissInstallForThirtyDays() {
    const next = Date.now() + 30 * 24 * 60 * 60 * 1000;
    setDismissUntil(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, String(next));
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
          <div className="pointer-events-auto rounded-xl border border-fuchsia-200 bg-fuchsia-50/95 px-3 py-2 text-xs font-bold text-fuchsia-700 shadow-[0_10px_30px_rgba(120,53,15,0.15)] backdrop-blur">
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

      <div className={`pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[95] mx-auto flex w-full max-w-xl justify-center px-3 ${showBottomBar ? "" : "hidden"}`}>
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-[0_20px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          {showInstall ? (
            <>
              <button
                type="button"
                onClick={() => void handleInstall()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#D8B24A] bg-[#FFF7E4] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#A87A17]"
                disabled={installing}
              >
                <Download size={14} />
                {installing ? "Installing" : installHint}
              </button>
              <button
                type="button"
                onClick={dismissInstallForThirtyDays}
                className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600"
              >
                Not Now
              </button>
            </>
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
          ) : null}
        </div>
      </div>
    </>
  );
}
