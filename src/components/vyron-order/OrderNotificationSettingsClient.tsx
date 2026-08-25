"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MessageSquare, Bell, Send, Trash2, Plus, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { NotificationRecipient, RecipientRole, DeliveryChannel } from "@/lib/vyron-order-notifications";

/**
 * Who hears about customer orders, and how.
 *
 * The channel status shown here is the truth reported by the server, not a
 * hopeful label: a channel with no provider says "Not configured" and a test
 * against it will say so too. Nothing on this screen claims a message was sent
 * unless the provider confirmed it.
 */

type Providers = Record<string, { configured: boolean; detail: string }>;

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
      <Link href="/order-centre" className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-3 pr-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700">
        <ArrowLeft size={15} /> Order Centre
      </Link>

      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-black text-slate-950">Order notifications</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
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
            <div key={key} className={`rounded-2xl border p-4 ${on ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                {icon} {label}
              </p>
              <p className={`mt-2 flex items-center gap-1.5 text-sm font-black ${on ? "text-emerald-700" : "text-amber-800"}`}>
                {on ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                {on ? "Operational" : "Not configured"}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{p?.detail || ""}</p>
            </div>
          );
        })}
      </section>

      {notice ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}
      {testResult ? (
        <p className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-bold ${
          testResult.status === "Sent" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
        }`}>
          {testResult.status === "Sent" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>
            Test to {testResult.name} via {testResult.channel}: <strong>{testResult.status}</strong>
            {testResult.error ? <span className="block font-semibold">{testResult.error}</span> : null}
          </span>
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Recipients</h2>
          <button
            type="button"
            onClick={() => { setDraft(emptyDraft()); setNotice(null); setTestResult(null); }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase tracking-[0.1em] text-white"
          >
            <Plus size={15} /> Add recipient
          </button>
        </div>

        {recipients === null ? (
          <p className="px-5 py-6 text-sm font-semibold text-slate-400">Loading…</p>
        ) : recipients.length === 0 && !draft ? (
          <div className="px-5 py-10 text-center">
            <Bell size={24} className="mx-auto text-slate-300" />
            <p className="mt-3 text-base font-black text-slate-900">Nobody is being notified yet</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Add the people who should hear when a customer places an order.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recipients.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-slate-950">{r.name}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">{r.role}</span>
                    {r.status === "Inactive" ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-red-700">Inactive</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {[r.email, r.mobile].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-[0.08em]">
                    {r.emailEnabled && r.email ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Email</span> : null}
                    {r.smsEnabled && r.mobile ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">SMS</span> : null}
                    {r.whatsappEnabled && r.mobile ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">WhatsApp</span> : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.emailEnabled && r.email ? (
                    <button type="button" disabled={busy} onClick={() => void sendTest(r, "email")}
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.1em] text-slate-700 disabled:opacity-50">
                      <Send size={14} /> Test
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setDraft({
                    id: r.id, name: r.name, role: r.role, email: r.email || "", mobile: r.mobile || "",
                    emailEnabled: r.emailEnabled, smsEnabled: r.smsEnabled, whatsappEnabled: r.whatsappEnabled, status: r.status,
                  })}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700">
                    Edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => void remove(r.id, r.name)} aria-label={`Remove ${r.name}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {draft ? (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-5">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              {draft.id ? "Edit recipient" : "New recipient"}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Name</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-slate-900" />
              </label>
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Role</span>
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as RecipientRole })}
                  className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-slate-900">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                  {ROLES.find((r) => r.value === draft.role)?.hears}
                </span>
              </label>
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Email</span>
                <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} inputMode="email"
                  className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-slate-900" />
              </label>
              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Mobile</span>
                <input value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} inputMode="tel"
                  className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-slate-900" />
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
                    className="h-5 w-5 rounded border-slate-300" />
                  <span className={`text-sm font-bold ${available ? "text-slate-700" : "text-slate-400"}`}>
                    {label}{available ? "" : " — no provider yet"}
                  </span>
                </label>
              ))}
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={draft.status === "Active"}
                  onChange={(e) => setDraft({ ...draft, status: e.target.checked ? "Active" : "Inactive" })}
                  className="h-5 w-5 rounded border-slate-300" />
                <span className="text-sm font-bold text-slate-700">Active</span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void save()} disabled={busy}
                className="h-12 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-[0.1em] text-white disabled:opacity-50">
                {busy ? "Saving…" : "Save recipient"}
              </button>
              <button type="button" onClick={() => setDraft(null)}
                className="h-12 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-[0.1em] text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
