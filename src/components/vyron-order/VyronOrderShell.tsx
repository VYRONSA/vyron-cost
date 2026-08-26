"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound, History, ShoppingBag, Download } from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import { VyronLogoLockup, VyronLogoMark } from "@/components/vyron-ui/VyronLogo";
import VyronOrderInstall, { useCanInstall } from "@/components/vyron-order/VyronOrderInstall";

const M = VYRON_MASTER;

/**
 * The VYRON ORDER customer shell.
 *
 * Same design language as VYRON COST — the same page wash, the same glass
 * cards, the same gradient, the same type scale — but deliberately none of its
 * structure. No sidebar, no command bar, no procurement or manufacturing
 * navigation: a customer must never see the operational product. What they get
 * is a header, their identity, and their work.
 *
 * `vyron-public-page` is the class VYRON COST uses to trigger the ambient
 * background wash on <body>, so the portal sits on the same surface as the rest
 * of the platform rather than on flat white.
 *
 * The content clamp is narrower than VYRON COST's 1440px. This is an ordering
 * workspace, not a register of columns, and a wider measure would leave the
 * page feeling stretched rather than composed.
 */

export const ORDER_CONTENT_WIDTH = "max-w-[1180px]";

export default function VyronOrderShell({
  customerName,
  onSignOut,
  onOrders,
  onNewOrder,
  children,
}: {
  customerName: string;
  onSignOut: () => void;
  onOrders?: () => void;
  onNewOrder?: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  /* Hidden once it is already running as an installed app. */
  const canInstall = useCanInstall();

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  return (
    <main className={`${M.page} min-h-dvh`}>
      <header className="sticky top-0 z-40 border-b border-[rgba(15,23,42,0.07)] bg-white/72 backdrop-blur-xl backdrop-saturate-150">
        <div className={`mx-auto flex w-full ${ORDER_CONTENT_WIDTH} items-center justify-between gap-3 px-4 py-3 md:px-8`}>
          {/*
            The full lockup carries a tagline that crowds a 390px screen, so the
            phone gets the mark plus the wordmark and the desktop gets the
            lockup. Same asset, same brand, no wrapping.
          */}
          <span className="flex min-w-0 items-center">
            <span className="md:hidden">
              <span className="flex items-center gap-2.5">
                <VyronLogoMark size={32} />
                <span className="text-[1.05rem] font-black leading-none tracking-[0.14em]">
                  <span className="text-[#0F172A]">VYRON</span>
                  <span className="text-[#0B54D6]">ORDER</span>
                </span>
              </span>
            </span>
            <span className="hidden md:block">
              <VyronLogoLockup suffix="ORDER" size={40} />
            </span>
          </span>

          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden min-w-0 text-right lg:block">
              <span className="block truncate text-sm font-bold text-[#0F172A]">{customerName}</span>
              <span className="vyron-t-label block text-[10px] text-[#64748B]">Ordering workspace</span>
            </span>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Account"
                className={`${M.secondaryBtn} h-11 gap-2 px-3`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg vyron-grad-surface text-[10px] font-black text-white">
                  {customerName.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <ChevronDown size={15} className={`transition ${menuOpen ? "rotate-180" : ""}`} />
              </button>

              {menuOpen ? (
                <div className={`${M.lightCard} absolute right-0 z-50 mt-2 w-[min(17rem,calc(100vw-2rem))] overflow-hidden p-0`}>
                  <div className="border-b border-[rgba(15,23,42,0.07)] px-4 py-3.5">
                    <p className="vyron-t-label text-[10px] text-[#64748B]">Signed in as</p>
                    {/* Company identity only — never a tenant or customer id. */}
                    <p className="mt-1 truncate text-sm font-bold text-[#0F172A]">{customerName}</p>
                  </div>
                  <div className="p-1.5">
                    {onNewOrder ? (
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); onNewOrder(); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#334155] transition hover:bg-[rgba(15,23,42,0.04)]"
                      >
                        <ShoppingBag size={16} className="text-[#64748B]" /> New order
                      </button>
                    ) : null}
                    {onOrders ? (
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); onOrders(); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#334155] transition hover:bg-[rgba(15,23,42,0.04)]"
                      >
                        <History size={16} className="text-[#64748B]" /> My orders
                      </button>
                    ) : null}
                    {canInstall ? (
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); setInstallOpen(true); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#334155] transition hover:bg-[rgba(15,23,42,0.04)]"
                      >
                        <Download size={16} className="text-[#64748B]" /> Install app
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onSignOut(); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#BE123C] transition hover:bg-[rgba(190,18,60,0.06)]"
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className={`mx-auto w-full ${ORDER_CONTENT_WIDTH} px-4 pb-20 pt-6 md:px-8 md:pt-8`}>{children}</div>

      <VyronOrderInstall open={installOpen} onClose={() => setInstallOpen(false)} />
    </main>
  );
}

/** The signed-out surface: same wash, same glass card, centred. */
export function VyronOrderAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${M.page} flex min-h-dvh flex-col items-center justify-center px-4 py-10`}>
      <div className="w-full max-w-[26rem]">
        <div className="flex flex-col items-center text-center">
          <VyronLogoMark size={60} />
          <h1 className="mt-4 text-[1.6rem] font-black leading-none tracking-[0.14em]">
            <span className="text-[#0F172A]">VYRON</span>
            <span className="vyron-grad-text">ORDER</span>
          </h1>
          <p className="mt-2.5 text-sm font-medium text-[#64748B]">Place your order in under a minute.</p>
        </div>
        {children}
      </div>
      <p className="mt-8 flex items-center gap-1.5 text-[11px] font-semibold text-[#94A3B8]">
        <UserRound size={12} /> Powered by VYRON COST
      </p>
    </main>
  );
}
