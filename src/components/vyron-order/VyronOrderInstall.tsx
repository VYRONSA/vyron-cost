"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Download, Share, PlusSquare, X, Check } from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Installing VYRON ORDER on a phone.
 *
 * The application-wide install prompt cannot help a customer: it only appears
 * once /api/workspace/status reports a signed-in staff session, and a customer
 * has an ordering session instead. So it never fired for the people who most
 * need the app on their home screen.
 *
 * This is deliberate rather than automatic. Chrome and Edge hand us the install
 * event and we use it. Safari on iOS has no such API at all — the only way in
 * is Share then Add to Home Screen — so on iOS we say exactly that instead of
 * offering a button that cannot work.
 */

function readIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so the touch test catches it.
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function readStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/*
 * Both of these are facts about the browser rather than state this component
 * owns, so they are subscribed to rather than copied into state inside an
 * effect. The server snapshot is the conservative one: not installed, not iOS.
 */
function subscribeToDisplayMode(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

function useStandalone() {
  return useSyncExternalStore(subscribeToDisplayMode, readStandalone, () => false);
}

/** The user agent never changes, so nothing has to be watched. */
function useIsIos() {
  return useSyncExternalStore(() => () => {}, readIos, () => false);
}

/** Whether an install route exists at all, so the shell can hide the entry. */
export function useCanInstall() {
  return !useStandalone();
}

export default function VyronOrderInstall({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const ios = useIsIos();
  const standalone = useStandalone();
  const installed = standalone || accepted;

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      // Keep it: the browser's own banner is suppressed so the customer gets
      // this one, at the moment they asked for it.
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setAccepted(true);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setAccepted(true);
      setPrompt(null);
    } catch {
      /* The customer can try again; nothing has changed. */
    } finally {
      setBusy(false);
    }
  }, [prompt, busy]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(7,17,31,0.45)] backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Install VYRON ORDER"
        className="w-full max-w-md rounded-t-2xl border border-[rgba(15,23,42,0.07)] bg-white p-5 shadow-[var(--vyron-elev-4)] sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
              {/* The real app icon, so the customer recognises what lands on their phone. */}
              <Image src="/vyron-order/icon-192.png" alt="" width={48} height={48} className="h-12 w-12" unoptimized />
            </span>
            <span className="min-w-0">
              <span className="block text-[1.05rem] font-black leading-none tracking-[0.14em]">
                <span className="text-[#0F172A]">VYRON</span>
                <span className="vyron-grad-text">ORDER</span>
              </span>
              <span className="mt-1 block text-xs font-medium text-[#64748B]">Add it to your home screen</span>
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#64748B] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[#0F172A]"
          >
            <X size={18} />
          </button>
        </div>

        {installed ? (
          <p className={`${M.alertSuccess} mt-5 flex items-center gap-2 px-4 py-3 text-sm font-bold`}>
            <Check size={16} /> VYRON ORDER is installed on this device.
          </p>
        ) : ios ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-[#334155]">
              On iPhone and iPad, Safari adds apps from the share menu:
            </p>
            <ol className="mt-4 space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(15,23,42,0.05)] text-xs font-black text-[#0F172A]">1</span>
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#334155]">
                  Tap <Share size={16} className="shrink-0 text-[#4F46E5]" /> Share at the bottom of Safari
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(15,23,42,0.05)] text-xs font-black text-[#0F172A]">2</span>
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#334155]">
                  Choose <PlusSquare size={16} className="shrink-0 text-[#4F46E5]" /> Add to Home Screen
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(15,23,42,0.05)] text-xs font-black text-[#0F172A]">3</span>
                <span className="min-w-0 text-sm font-medium text-[#334155]">Tap Add — it appears as VYRON ORDER</span>
              </li>
            </ol>
            <p className="mt-4 text-xs font-medium text-[#94A3B8]">
              It has to be Safari. Chrome on iPhone cannot add apps to the home screen.
            </p>
          </div>
        ) : prompt ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-[#334155]">
              Install it and your orders are one tap away — full screen, no address bar, and it
              remembers you between visits.
            </p>
            <button
              type="button"
              onClick={() => void install()}
              disabled={busy}
              className={`${M.primaryBtn} mt-5 h-12 w-full text-xs uppercase tracking-[0.1em] disabled:opacity-50`}
            >
              <Download size={16} /> {busy ? "Installing…" : "Install VYRON ORDER"}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-sm font-medium text-[#334155]">
              Your browser has not offered the install option yet. It usually appears after you have
              used the site for a moment.
            </p>
            <p className="mt-3 text-sm font-medium text-[#334155]">
              You can also install from the browser menu — look for <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className={`${M.secondaryBtn} mt-3 h-12 w-full text-xs font-bold uppercase tracking-[0.1em]`}
        >
          {installed ? "Done" : "Not now"}
        </button>
      </div>
    </div>
  );
}
