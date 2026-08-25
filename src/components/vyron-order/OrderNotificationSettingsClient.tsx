"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MessageSquare, Bell, Send, Trash2, Plus, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { NotificationRecipient, RecipientRole, DeliveryChannel } from "@/lib/vyron-order-notifications";

import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

/**
 * Who hears about customer orders, and how.
 *
 * The channel status shown here is the truth reported by the server, not a
 * hopeful label: a channel with no provider says "Not configured" and a test
 * against it will say so too. Nothing on this screen claims a message was sent
 * unless the provider confirmed it.
 */

type ProviderCard = {
  configured: boolean;
  provider: string | null;
  missing: string[];
  detail: string;
  lastSuccessAt: string | null;
};
type Providers = Record<string, ProviderCard>;

/** Last genuine success, from the delivery log — not from configuration. */
function lastSuccessLabel(iso: string | null) {
  if (!iso) return "No successful delivery yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No successful delivery yet";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `Last successful delivery: ${d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`
    : `Last successful delivery: ${d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`;
}

const ROLES: { value: RecipientRole; label: string; hears: string }[] = [
  { value: "Commercial", label: "Commercial", hears: "New orders, approvals, cancellations" },
  { value: "Production", label: "Production", hears: "Approved, picking and packed orders" },
  { value: "Delivery", label: "Delivery", hears: "Packed and dispatched orders" },
  { value: "Management", label: "Management", hears: "New orders and cancellations" },
];

type Draft = {
  id: string | null;
  name: string;
  role: RecipientRole;
  email: string;
  mobile: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  status: "Active" | "Inactive";
};

const emptyDraft = (): Draft => ({
  id: null, name: "", role: "Commercial", email: "", mobile: "",
  emailEnabled: true, smsEnabled: false, whatsappEnabled: false, status: "Active",
});

export default function OrderNotificationSettingsClient() {
  const [recipients, setRecipients] = useState<NotificationRecipient[] | null>(null);
  const [providers, setProviders] = useState<Providers>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ name: string; channel: string; status: string; error: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/vyron-order/staff/recipients", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't load recipients."); setRecipients([]); return; }
      setRecipients(body.recipients as NotificationRecipient[]);
      setProviders(body.providers as Providers);
      setError(null);
    } catch {
      setError("We couldn't load recipients.");
      setRecipients([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vyron-order/staff/recipients", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) { setRecipients(body.recipients as NotificationRecipient[]); setProviders(body.providers as Providers); }
        else { setError(body?.error || "We couldn't load recipients."); setRecipients([]); }
      })
      .catch(() => { if (!cancelled) { setError("We couldn't load recipients."); setRecipients([]); } });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vyron-order/staff/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't save that recipient."); return; }
      setNotice(`${draft.name} saved.`);
      setDraft(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    setBusy(true);
    try {
      await fetch(`/api/vyron-order/staff/recipients?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setNotice(`${name} removed. Their delivery history is kept.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(recipient: NotificationRecipient, channel: DeliveryChannel) {
    setBusy(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/vyron-order/staff/recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: recipient.id, channel }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) { setError(body?.error || "We couldn't send that test."); return; }
      setTestResult({ name: recipient.name, channel, status: body.result.status, error: body.result.error });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/order-centre" className={`${M.secondaryBtn} inline-flex h-11 items-center gap-1.5 pl-3 pr-4 text-xs font-bold uppercase tracking-[0.1em]`}>
        <ArrowLeft size={15} /> Order Centre
      </Link>

      <header className={`${M.modulePanel} p-5`}>
        <h1 className={`text-xl ${M.heading}`}>Order notifications</h1>
        <p className="mt-1 text-sm font-semibold text-[#64748B]">
          When a customer places an order, these people hear about it. An order is recorded whether
          or not a notification reaches anyone — it will always be in the Order Centre.
        </p>
      </header>

      {/* Channel truth, straight from the server. */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ["inApp", "In-app", <Bell key="b" size={15} />],
          ["email", "Email", <Mail key="m" size={15} />],
          ["sms", "SMS", <MessageSquare key="s" size={15} />],
          ["whatsapp", "WhatsApp", <MessageSquare key="w" size={15} />],
        ] as const).map(([key, label, icon]) => {
          const p = providers[key];
          const on = Boolean(p?.configured);
          return (
            <div key={key} className={`${M.dashboardWidget} ${on ? "border-[#047857]/25" : "border-[#B45309]/25"}`}>
              <p className={`${M.label} flex items-center gap-1.5`}>
                {icon} {label}
              </p>
              <p className={`mt-2 flex items-center gap-1.5 text-sm font-black ${on ? "vyron-metric-success" : "vyron-metric-warning"}`}>
                {on ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                {on ? "Operational" : "Not configured"}
              </p>
              {on && p?.provider ? (
                <p className="mt-0.5 text-xs font-bold text-[#334155]">{p.provider}</p>
              ) : null}
              <p className="mt-1.5 text-[11px] font-semibold text-[#64748B]">{p?.detail || ""}</p>
              {on ? (
                <p className="mt-1.5 text-[11px] font-semibold text-[#94A3B8]">{lastSuccessLabel(p?.lastSuccessAt ?? null)}</p>
              ) : p?.missing?.length ? (
                <p className="mt-1.5 text-[11px] font-bold text-[#B45309]">
                  Missing: {p.missing.join(", ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </section>

      {notice ? <p role="status" className={`${M.alertSuccess} px-4 py-3 text-sm font-bold`}>{notice}</p> : null}
      {error ? <p role="alert" className={`${M.alertError} px-4 py-3 text-sm font-bold`}>{error}</p> : null}
      {testResult ? (
        <p className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-bold ${
          testResult.status === "Sent" ? M.alertSuccess : M.alertWarning
        }`}>
          {testResult.status === "Sent" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>
            Test to {testResult.name} via {testResult.channel}: <strong>{testResult.status}</strong>
            {testResult.error ? <span className="block font-semibold">{testResult.error}</span> : null}
          </span>
        </p>
      ) : null}

      <section className={M.modulePanel + " p-0"}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.07)] px-5 py-4">
          <h2 className={`${M.label} text-[11px]`}>Recipients</h2>
          <button
            type="button"
            onClick={() => { setDraft(emptyDraft()); setNotice(null); setTestResult(null); }}
            className={`${M.primaryBtn} h-11 px-4 text-xs uppercase tracking-[0.1em]`}
          >
            <Plus size={15} /> Add recipient
          </button>
        </div>

        {recipients === null ? (
          <p className="px-5 py-6 text-sm font-semibold text-[#94A3B8]">Loading…</p>
        ) : recipients.length === 0 && !draft ? (
          <div className="px-5 py-10 text-center">
            <Bell size={24} className="mx-auto text-[#CBD5E1]" />
            <p className="mt-3 text-base font-black text-[#0F172A]">Nobody is being notified yet</p>
            <p className="mt-1 text-sm font-semibold text-[#64748B]">
              Add the people who should hear when a customer places an order.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(15,23,42,0.06)]">
            {recipients.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-[#0F172A]">{r.name}</p>
                    <span className="vyron-status vyron-status-neutral">{r.role}</span>
                    {r.status === "Inactive" ? (
                      <span className="vyron-status vyron-status-error">Inactive</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#64748B]">
                    {[r.email, r.mobile].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-[0.08em]">
                    {r.emailEnabled && r.email ? <span className="rounded bg-[rgba(15,23,42,0.05)] px-1.5 py-0.5 text-[#334155]">Email</span> : null}
                    {r.smsEnabled && r.mobile ? <span className="rounded bg-[rgba(15,23,42,0.05)] px-1.5 py-0.5 text-[#334155]">SMS</span> : null}
                    {r.whatsappEnabled && r.mobile ? <span className="rounded bg-[rgba(15,23,42,0.05)] px-1.5 py-0.5 text-[#334155]">WhatsApp</span> : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* A test per channel the recipient actually has, so each one
                      can be proven independently. */}
                  {([
                    ["email", "Email", Boolean(r.emailEnabled && r.email)],
                    ["sms", "SMS", Boolean(r.smsEnabled && r.mobile)],
                    ["whatsapp", "WhatsApp", Boolean(r.whatsappEnabled && r.mobile)],
                  ] as const).filter(([, , show]) => show).map(([channel, label]) => (
                    <button key={channel} type="button" disabled={busy} onClick={() => void sendTest(r, channel)}
                      className={`${M.secondaryBtn} h-11 px-3 text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-50`}>
                      <Send size={14} /> {label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setDraft({
                    id: r.id, name: r.name, role: r.role, email: r.email || "", mobile: r.mobile || "",
                    emailEnabled: r.emailEnabled, smsEnabled: r.smsEnabled, whatsappEnabled: r.whatsappEnabled, status: r.status,
                  })}
                    className={`${M.secondaryBtn} h-11 px-4 text-xs font-bold uppercase tracking-[0.1em]`}>
                    Edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => void remove(r.id, r.name)} aria-label={`Remove ${r.name}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#94A3B8] transition hover:bg-[rgba(190,18,60,0.06)] hover:text-[#BE123C] disabled:opacity-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {draft ? (
          <div className="border-t border-[rgba(15,23,42,0.07)] bg-[rgba(15,23,42,0.03)] px-5 py-5">
            <p className={M.label}>
              {draft.id ? "Edit recipient" : "New recipient"}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={M.label}>Name</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={`${M.input} mt-1 h-12 py-0 text-base font-bold`} />
              </label>
              <label className="block">
                <span className={M.label}>Role</span>
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as RecipientRole })}
                  className={`${M.input} mt-1 h-12 py-0 text-base font-bold`}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <span className="mt-1 block text-[11px] font-semibold text-[#64748B]">
                  {ROLES.find((r) => r.value === draft.role)?.hears}
                </span>
              </label>
              <label className="block">
                <span className={M.label}>Email</span>
                <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} inputMode="email"
                  className={`${M.input} mt-1 h-12 py-0 text-base font-bold`} />
              </label>
              <label className="block">
                <span className={M.label}>Mobile</span>
                <input value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} inputMode="tel"
                  className={`${M.input} mt-1 h-12 py-0 text-base font-bold`} />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              {([
                ["emailEnabled", "Email", true],
                ["smsEnabled", "SMS", Boolean(providers.sms?.configured)],
                ["whatsappEnabled", "WhatsApp", Boolean(providers.whatsapp?.configured)],
              ] as const).map(([key, label, available]) => (
                <label key={key} className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={draft[key]} disabled={!available}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                    className="h-5 w-5 rounded border-[rgba(15,23,42,0.20)] accent-[#2563EB]" />
                  <span className={`text-sm font-bold ${available ? "text-[#334155]" : "text-[#94A3B8]"}`}>
                    {label}{available ? "" : " — no provider yet"}
                  </span>
                </label>
              ))}
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={draft.status === "Active"}
                  onChange={(e) => setDraft({ ...draft, status: e.target.checked ? "Active" : "Inactive" })}
                  className="h-5 w-5 rounded border-[rgba(15,23,42,0.20)] accent-[#2563EB]" />
                <span className="text-sm font-bold text-[#334155]">Active</span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void save()} disabled={busy}
                className={`${M.primaryBtn} h-12 px-5 text-xs uppercase tracking-[0.1em] disabled:opacity-50`}>
                {busy ? "Saving…" : "Save recipient"}
              </button>
              <button type="button" onClick={() => setDraft(null)}
                className={`${M.secondaryBtn} h-12 px-5 text-xs font-bold uppercase tracking-[0.1em]`}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
