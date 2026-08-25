"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Check } from "lucide-react";
import type { InAppNotification } from "@/lib/vyron-order-notifications";

/**
 * The staff notification bell.
 *
 * In-app notifications are the channel that always works: they need no email
 * webhook, no SMS provider and no credentials, so an order can never arrive
 * unseen because something external is down.
 *
 * Polling rather than Realtime — VYRON has no Realtime architecture and adding
 * one for a single badge would be a new dependency for no benefit. It polls
 * every 30 seconds, pauses entirely while the tab is hidden, and refreshes
 * immediately when the tab comes back, so a phone left in a pocket is not
 * quietly hammering the database.
 */

const POLL_MS = 30_000;

const money = (v: number) =>
  `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function StaffNotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/vyron-order/staff/notifications?includeRead=1", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      if (body?.ok) {
        setItems(body.items as InAppNotification[]);
        setUnread(Number(body.unreadCount || 0));
      }
    } catch {
      /* the badge simply does not change */
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => { void load(); }, POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { void load(); start(); }
    };

    // The first read settles asynchronously rather than setting state inside
    // the effect body; the interval and the visibility handler are event
    // callbacks and may call load() directly.
    fetch("/api/vyron-order/staff/notifications?includeRead=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body?.ok) return;
        setItems(body.items as InAppNotification[]);
        setUnread(Number(body.unreadCount || 0));
      })
      .catch(() => { /* the badge simply does not change */ });
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    try {
      await fetch("/api/vyron-order/staff/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally {
      void load();
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] transition hover:bg-slate-50"
      >
        <Bell size={17} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-black text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Notifications</span>
            {unread > 0 ? (
              <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.1em] text-[#2563EB]">
                <Check size={13} /> Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">No notifications yet</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">New customer orders will appear here.</p>
              </div>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.orderId ? `/order-centre/${item.orderId}` : "/order-centre"}
                  onClick={() => setOpen(false)}
                  className={`flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 ${item.read ? "" : "bg-blue-50/40"}`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {!item.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563EB]" /> : null}
                      <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#2563EB]">{item.eventLabel}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-black text-slate-950">
                      {item.customerName || "Customer order"}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                      {item.orderNumber}
                      {item.total !== null ? ` · ${money(item.total)}` : ""} · {timeAgo(item.createdAt)}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-slate-400" />
                </Link>
              ))
            )}
          </div>

          <Link
            href="/order-centre"
            onClick={() => setOpen(false)}
            className="block bg-slate-50 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.1em] text-slate-700 transition hover:bg-slate-100"
          >
            Open VYRON ORDER CENTRE
          </Link>
        </div>
      ) : null}
    </div>
  );
}
