"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Search, ShieldCheck, ShieldOff, Clock, AlertTriangle, Link2, Copy, Check, Users, X } from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import type { PortalAccessRow } from "@/lib/vyron-order-customer-auth";

const M = VYRON_MASTER;

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

  /*
   * Every figure below is counted from the rows the API already returned.
   * Nothing is derived from a second request and nothing is estimated.
   */
  const withAccess = (rows || []).filter((r) => r.hasAccess).length;
  const activeCount = (rows || []).filter((r) => r.hasAccess && r.status === "Active").length;
  const lockedCount = (rows || []).filter((r) => r.locked).length;
  const draftRow = draft ? (rows || []).find((r) => r.customerId === draft.customerId) || null : null;

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
    /* Named so visual QA can measure this screen without the staff shell around it. */
    <div data-vyron-screen="customer-portal-access" className="space-y-5">
      {/* The module header VYRON COST uses everywhere else. */}
      <header className={`${M.moduleHeaderNavy} p-4 lg:p-7`}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {/*
                The mobile shell already names the page above this panel, so on
                a phone the header keeps only what the shell does not say.
              */}
              <div className="mb-2 hidden items-center gap-2 rounded-full border border-[#3B82F6]/35 bg-[#3B82F6]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#BFDBFE] lg:inline-flex">
                VYRON ORDER
              </div>
              {/* Present on every screen so the page can be announced; hidden from sight on phones. */}
              <h1 className={`sr-only lg:not-sr-only lg:text-4xl lg:tracking-tight ${M.headingOnDark}`}>
                Customer Portal Access
              </h1>
              <p className={`mt-2 hidden max-w-3xl text-sm font-medium leading-6 lg:block ${M.bodyOnDark}`}>
                Manage which customers can access VYRON ORDER.
              </p>
              <p className="flex items-start gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-semibold text-[#CBD5E1] lg:mt-4">
                <KeyRound size={15} className="mt-0.5 shrink-0 text-[#BFDBFE]" />
                PINs are stored as a one-way hash. They cannot be displayed or recovered here — if a
                customer forgets theirs, issue a new one.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Counts over the rows already on screen, not a second source. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {([
          { key: "customers", label: "Customers", value: rows === null ? null : rows.length, icon: <Users size={14} />, tone: "" },
          { key: "access", label: "Portal access", value: rows === null ? null : withAccess, icon: <KeyRound size={14} />, tone: "" },
          { key: "active", label: "Active", value: rows === null ? null : activeCount, icon: <ShieldCheck size={14} />, tone: activeCount > 0 ? "vyron-metric-success" : "" },
          { key: "locked", label: "Locked", value: rows === null ? null : lockedCount, icon: <AlertTriangle size={14} />, tone: lockedCount > 0 ? "vyron-metric-warning" : "" },
        ]).map((tile) => (
          <div key={tile.key} className={M.dashboardWidget}>
            <span className={`flex items-center gap-1.5 ${M.label}`}>
              <span className={`${M.iconSubtle} h-6 w-6`}>{tile.icon}</span> {tile.label}
            </span>
            <span className={`mt-2 block text-2xl tabular-nums ${tile.tone || "font-black text-[#0F172A]"}`}>
              {tile.value === null ? "—" : tile.value}
            </span>
          </div>
        ))}
      </div>

      {/*
        The ordering link comes first because nothing else on this screen works
        without it: a customer with a PIN but no link has nowhere to sign in.
      */}
      <section className={`${M.modulePanel} p-5`}>
        <h2 className={`${M.label} flex items-center gap-2 text-[11px]`}>
          <Link2 size={14} /> Ordering link
        </h2>
        <p className="mt-1 text-xs font-semibold text-[#64748B]">
          This is the address customers open to order from you. It identifies you, not them — everyone
          still signs in with their own PIN.
        </p>

        {tenant && !linkDraft ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="min-w-0 break-all rounded-xl vyron-grad-surface px-4 py-3 text-sm font-black text-white shadow-[var(--vyron-elev-brand)]">
              {orderingUrl(tenant.slug)}
            </code>
            <button
              type="button"
              onClick={() => copyLink(tenant.slug)}
              className={`${M.secondaryBtn} h-12 px-4 text-xs font-bold uppercase tracking-[0.1em]`}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setLinkDraft({ slug: tenant.slug, displayName: tenant.displayName })}
              className={`${M.secondaryBtn} h-12 px-4 text-xs font-bold uppercase tracking-[0.1em]`}
            >
              Change
            </button>
          </div>
        ) : null}

        {!tenant && !linkDraft ? (
          <div className={`${M.alertWarning} mt-3 p-4`}>
            <p className="text-sm font-bold">
              No ordering link yet — customers cannot reach your portal until you create one.
            </p>
            <button
              type="button"
              onClick={() => setLinkDraft({ slug: "", displayName: "" })}
              className={`${M.primaryBtn} mt-3 h-12 px-5 text-xs uppercase tracking-[0.1em]`}
            >
              Create ordering link
            </button>
          </div>
        ) : null}

        {linkDraft ? (
          <div className={`mt-3 ${M.modulePanelNested}`}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className={M.label}>Link</span>
                <input
                  value={linkDraft.slug}
                  onChange={(e) => setLinkDraft({ ...linkDraft, slug: e.target.value.toLowerCase() })}
                  placeholder="your-company"
                  className={`${M.input} mt-1 h-12 w-56 py-0 text-base font-bold`}
                />
              </label>
              <label className="block">
                <span className={M.label}>Name customers see</span>
                <input
                  value={linkDraft.displayName}
                  onChange={(e) => setLinkDraft({ ...linkDraft, displayName: e.target.value })}
                  placeholder="Your Company Name"
                  className={`${M.input} mt-1 h-12 w-72 max-w-full py-0 text-base font-bold`}
                />
              </label>
              <button
                type="button"
                onClick={() => void saveLink()}
                disabled={busy}
                className={`${M.primaryBtn} h-12 px-5 text-xs uppercase tracking-[0.1em] disabled:opacity-50`}
              >
                {busy ? "Saving…" : "Save link"}
              </button>
              <button
                type="button"
                onClick={() => setLinkDraft(null)}
                className={`${M.secondaryBtn} h-12 px-5 text-xs font-bold uppercase tracking-[0.1em]`}
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#64748B]">
              Letters, numbers and hyphens. Changing it stops the old link working, so only change it
              if you have to.
            </p>
          </div>
        ) : null}
      </section>

      {notice ? (
        <p role="status" className={`${M.alertSuccess} px-4 py-3 text-sm font-bold`}>{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className={`${M.alertError} px-4 py-3 text-sm font-bold`}>{error}</p>
      ) : null}

      <div className={`${M.filterBar} mb-0 flex flex-wrap items-center gap-3`}>
        <label className="flex h-12 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white/85 px-3 transition focus-within:border-[#4F46E5] focus-within:ring-4 focus-within:ring-[#4F46E5]/12">
          <Search size={16} className="shrink-0 text-[#94A3B8]" />
          <span className="sr-only">Search customers</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers…"
            className={`h-full w-full bg-transparent text-sm font-semibold text-[#0F172A] outline-none ${M.inputPlaceholder}`}
          />
        </label>
        <div role="group" aria-label="Access filter" className="flex flex-wrap gap-2">
          {([["all", "All"], ["with", "Has access"], ["without", "No access"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={
                filter === value
                  ? `${M.primaryBtn} h-12 px-4 text-xs uppercase tracking-[0.1em]`
                  : `${M.secondaryBtn} h-12 px-4 text-xs font-bold uppercase tracking-[0.1em]`
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        /* A skeleton rather than a word, so the page does not jump when it lands. */
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${M.lightCard} h-[5.5rem] animate-pulse`} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className={M.moduleEmptyState}>
          <Users size={26} className="mx-auto text-[#CBD5E1]" />
          <p className="mt-3 text-base font-black text-[#0F172A]">
            {rows.length === 0 ? "No customers yet" : "No customers match that filter"}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#64748B]">
            {rows.length === 0
              ? "Customers added to your register appear here, ready to be given portal access."
              : "Try a different search, or show all customers."}
          </p>
          {rows.length > 0 && (filter !== "all" || search.trim()) ? (
            <button
              type="button"
              onClick={() => { setFilter("all"); setSearch(""); }}
              className={`${M.primaryBtn} mt-5 h-11 px-6 text-sm`}
            >
              Show all customers
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => {
            const locked = row.locked;
            return (
              <div
                key={row.customerId}
                className={`${M.lightCard} flex flex-wrap items-start justify-between gap-3 px-4 py-4`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-[#0F172A]">{row.customerName}</p>
                    {/* Access state, then lock state — both from the row, never inferred. */}
                    {row.hasAccess ? (
                      <span className={row.status === "Suspended" ? "vyron-status vyron-status-error" : "vyron-status vyron-status-success"}>
                        {row.status === "Suspended" ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                        {row.status}
                      </span>
                    ) : (
                      <span className="vyron-status vyron-status-neutral">No access</span>
                    )}
                    {locked ? (
                      <span className="vyron-status vyron-status-warning">
                        <AlertTriangle size={12} /> Locked
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[#64748B]">
                    {row.hasAccess ? (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> Last signed in {formatWhen(row.lastLoginAt)}
                        </span>
                        {row.failedAttempts > 0 ? (
                          <span className="text-[#B45309]">
                            {row.failedAttempts} failed attempt{row.failedAttempts === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span>Cannot sign in to VYRON ORDER yet</span>
                    )}
                  </p>
                </div>

                {/* Only the actions this customer's current state allows. */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setNotice(null); setError(null); setDraft({ customerId: row.customerId, pin: "", confirm: "" }); }}
                    className={
                      row.hasAccess
                        ? `${M.secondaryBtn} h-11 px-4 text-xs font-bold uppercase tracking-[0.1em]`
                        : `${M.primaryBtn} h-11 px-4 text-xs uppercase tracking-[0.1em]`
                    }
                  >
                    {row.hasAccess ? "Reset PIN" : "Give access"}
                  </button>

                  {row.hasAccess ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus(row.customerId, row.status === "Suspended" ? "Active" : "Suspended")}
                      className={`${M.secondaryBtn} h-11 px-4 text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-50 ${
                        row.status === "Suspended" ? "" : "text-[#BE123C] hover:border-[#BE123C]/40"
                      }`}
                    >
                      {row.status === "Suspended" ? "Restore" : "Suspend"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/*
        Issuing a PIN is deliberate, so it takes over the screen rather than
        unfolding inside a row. Nothing about the save changes: the same
        validation, the same request, and the PIN still never comes back.
      */}
      {draft ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(7,17,31,0.45)] p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={draftRow?.hasAccess ? "Reset PIN" : "Give portal access"}
            className="w-full max-w-lg rounded-t-2xl border border-[rgba(15,23,42,0.07)] bg-white p-5 shadow-[var(--vyron-elev-4)] sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={M.label}>{draftRow?.hasAccess ? "Reset PIN" : "Give portal access"}</p>
                <h2 className="mt-1 truncate vyron-t-display text-lg text-[#0F172A]">
                  {draftRow?.customerName || "Customer"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Close"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#64748B] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[#0F172A]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-3 text-sm font-medium text-[#334155]">
              Set a 4–8 digit PIN for this customer.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={M.label}>PIN (4–8 digits)</span>
                <input
                  value={draft.pin}
                  onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  className={`${M.input} mt-1 h-12 py-0 text-center text-lg font-black tracking-[0.3em]`}
                />
              </label>
              <label className="block">
                <span className={M.label}>Confirm</span>
                <input
                  value={draft.confirm}
                  onChange={(e) => setDraft({ ...draft, confirm: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  className={`${M.input} mt-1 h-12 py-0 text-center text-lg font-black tracking-[0.3em]`}
                />
              </label>
            </div>

            {error ? (
              <p role="alert" className={`${M.alertError} mt-4 px-4 py-3 text-sm font-bold`}>{error}</p>
            ) : null}

            <p className={`${M.alertWarning} mt-4 flex items-start gap-2 px-4 py-3 text-xs font-semibold`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Write it down before you save — this screen cannot show it to you again.
            </p>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className={`${M.secondaryBtn} order-2 h-12 text-xs font-bold uppercase tracking-[0.1em] sm:order-1`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePin()}
                disabled={busy}
                className={`${M.primaryBtn} order-1 h-12 text-xs uppercase tracking-[0.1em] disabled:opacity-50 sm:order-2`}
              >
                {busy ? "Saving…" : "Save PIN"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
