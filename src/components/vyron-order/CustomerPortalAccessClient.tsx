"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Search, ShieldCheck, ShieldOff, Clock, AlertTriangle, Link2, Copy, Check } from "lucide-react";
import type { PortalAccessRow } from "@/lib/vyron-order-customer-auth";

/**
 * Staff-side management of who can sign in to VYRON ORDER.
 *
 * A PIN can be issued here and then it is gone: it is sent once, used to derive
 * a hash on the server, and never stored, returned or displayed again. There is
 * no "view PIN" control on this screen because there is no way to build one —
 * a customer who forgets theirs is given a new one.
 */

type Draft = { customerId: string; pin: string; confirm: string };
type Tenant = { slug: string; displayName: string; status: string } | null;

/** Built from the browser own origin so it is correct in every environment. */
function orderingUrl(slug: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return origin + "/order/" + slug;
}

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function CustomerPortalAccessClient() {
  const [rows, setRows] = useState<PortalAccessRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant>(null);
  const [linkDraft, setLinkDraft] = useState<{ slug: string; displayName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/vyron-order/admin/access", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        setError(body?.error || "We couldn't load portal access.");
        setRows([]);
        return;
      }
      setRows(body.access as PortalAccessRow[]);
      setTenant((body.tenant as Tenant) ?? null);
      setError(null);
    } catch {
      setError("We couldn't load portal access.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vyron-order/admin/access", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) { setRows(body.access as PortalAccessRow[]); setTenant((body.tenant as Tenant) ?? null); }
        else { setError(body?.error || "We couldn't load portal access."); setRows([]); }
      })
      .catch(() => { if (!cancelled) { setError("We couldn't load portal access."); setRows([]); } });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (filter === "with" && !row.hasAccess) return false;
      if (filter === "without" && row.hasAccess) return false;
      if (term && !row.customerName.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, filter]);

  const withAccess = (rows || []).filter((r) => r.hasAccess).length;

  async function saveLink() {
    if (!linkDraft || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vyron-order/admin/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkDraft),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't save that link."); return; }
      setNotice("Ordering link saved: " + orderingUrl(body.tenant.slug));
      setLinkDraft(null);
      await load();
    } catch {
      setError("We couldn't save that link.");
    } finally {
      setBusy(false);
    }
  }

  function copyLink(slug: string) {
    navigator.clipboard?.writeText(orderingUrl(slug)).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* clipboard unavailable — the link is on screen to copy by hand */ }
    );
  }

  async function savePin() {
    if (!draft || busy) return;
    if (!/^\d{4,8}$/.test(draft.pin)) { setError("A PIN must be 4 to 8 digits."); return; }
    if (draft.pin !== draft.confirm) { setError("The two PINs do not match."); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vyron-order/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: draft.customerId, pin: draft.pin }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't set that PIN."); return; }
      const name = (rows || []).find((r) => r.customerId === draft.customerId)?.customerName || "The customer";
      // The PIN is not repeated back here — it exists only where it was typed.
      setNotice(`PIN set for ${name}. Give it to them directly; it cannot be looked up again.`);
      setDraft(null);
      await load();
    } catch {
      setError("We couldn't set that PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(customerId: string, status: "Active" | "Suspended") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vyron-order/admin/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, status }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't change that."); return; }
      setNotice(status === "Suspended" ? "Access suspended and their sessions ended." : "Access restored.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-black text-slate-950">Customer Portal Access</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {rows === null
            ? "Loading…"
            : `${withAccess} of ${rows.length} customer${rows.length === 1 ? "" : "s"} can sign in to VYRON ORDER.`}
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
          <KeyRound size={15} className="mt-0.5 shrink-0 text-slate-400" />
          PINs are stored as a one-way hash. They cannot be displayed or recovered here — if a
          customer forgets theirs, issue a new one.
        </p>
      </header>

      {/*
        The ordering link comes first because nothing else on this screen works
        without it: a customer with a PIN but no link has nowhere to sign in.
      */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          <Link2 size={14} /> Ordering link
        </h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          This is the address customers open to order from you. It identifies you, not them — everyone
          still signs in with their own PIN.
        </p>

        {tenant && !linkDraft ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
              {orderingUrl(tenant.slug)}
            </code>
            <button
              type="button"
              onClick={() => copyLink(tenant.slug)}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setLinkDraft({ slug: tenant.slug, displayName: tenant.displayName })}
              className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700"
            >
              Change
            </button>
          </div>
        ) : null}

        {!tenant && !linkDraft ? (
          <div className="mt-3">
            <p className="text-sm font-bold text-amber-800">
              No ordering link yet — customers cannot reach your portal until you create one.
            </p>
            <button
              type="button"
              onClick={() => setLinkDraft({ slug: "", displayName: "" })}
              className="mt-3 h-12 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-[0.1em] text-white"
            >
              Create ordering link
            </button>
          </div>
        ) : null}

        {linkDraft ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Link</span>
                <input
                  value={linkDraft.slug}
                  onChange={(e) => setLinkDraft({ ...linkDraft, slug: e.target.value.toLowerCase() })}
                  placeholder="your-company"
                  className="mt-1 h-12 w-56 rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Name customers see</span>
                <input
                  value={linkDraft.displayName}
                  onChange={(e) => setLinkDraft({ ...linkDraft, displayName: e.target.value })}
                  placeholder="Your Company Name"
                  className="mt-1 h-12 w-72 rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-slate-900"
                />
              </label>
              <button
                type="button"
                onClick={() => void saveLink()}
                disabled={busy}
                className="h-12 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-[0.1em] text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save link"}
              </button>
              <button
                type="button"
                onClick={() => setLinkDraft(null)}
                className="h-12 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-[0.1em] text-slate-600"
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Letters, numbers and hyphens. Changing it stops the old link working, so only change it
              if you have to.
            </p>
          </div>
        ) : null}
      </section>

      {notice ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-12 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <Search size={16} className="shrink-0 text-slate-400" />
          <span className="sr-only">Search customers</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers…"
            className="h-full w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
          />
        </label>
        <div role="group" aria-label="Access filter" className="inline-flex overflow-hidden rounded-xl border border-slate-200">
          {([["all", "All"], ["with", "Has access"], ["without", "No access"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`h-12 px-4 text-xs font-black uppercase tracking-[0.1em] transition ${
                filter === value ? "bg-slate-950 text-white" : "bg-white text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="text-sm font-semibold text-slate-400">Loading customers…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">
          No customers match that filter.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {visible.map((row) => {
              const locked = row.locked;
              const editing = draft?.customerId === row.customerId;
              return (
                <div key={row.customerId} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-950">{row.customerName}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                        {row.hasAccess ? (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <Clock size={12} /> Last signed in {formatWhen(row.lastLoginAt)}
                            </span>
                            {row.failedAttempts > 0 ? (
                              <span className="text-amber-700">{row.failedAttempts} failed attempt{row.failedAttempts === 1 ? "" : "s"}</span>
                            ) : null}
                          </>
                        ) : (
                          <span>No portal access</span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {row.hasAccess ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
                            row.status === "Suspended" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {row.status === "Suspended" ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                          {row.status}
                        </span>
                      ) : null}
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-800">
                          <AlertTriangle size={12} /> Locked
                        </span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => { setNotice(null); setError(null); setDraft(editing ? null : { customerId: row.customerId, pin: "", confirm: "" }); }}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 transition hover:bg-slate-50"
                      >
                        {row.hasAccess ? "Reset PIN" : "Give access"}
                      </button>

                      {row.hasAccess ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setStatus(row.customerId, row.status === "Suspended" ? "Active" : "Suspended")}
                          className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {row.status === "Suspended" ? "Restore" : "Suspend"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                        {row.hasAccess ? `New PIN for ${row.customerName}` : `PIN for ${row.customerName}`}
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="block">
                          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">PIN (4–8 digits)</span>
                          <input
                            value={draft.pin}
                            onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            className="mt-1 h-12 w-36 rounded-xl border border-slate-200 bg-white px-3 text-center text-lg font-black tracking-[0.3em] text-slate-900 outline-none focus:border-slate-900"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Confirm</span>
                          <input
                            value={draft.confirm}
                            onChange={(e) => setDraft({ ...draft, confirm: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            className="mt-1 h-12 w-36 rounded-xl border border-slate-200 bg-white px-3 text-center text-lg font-black tracking-[0.3em] text-slate-900 outline-none focus:border-slate-900"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void savePin()}
                          disabled={busy}
                          className="h-12 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-[0.1em] text-white disabled:opacity-50"
                        >
                          {busy ? "Saving…" : "Save PIN"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft(null)}
                          className="h-12 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-[0.1em] text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="mt-3 text-xs font-semibold text-slate-500">
                        Write it down before you save — this screen cannot show it to you again.
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
