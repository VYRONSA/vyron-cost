"use client";

import { useEffect, useState } from "react";
import { Card, Notice, PrimaryButton, SecondaryButton } from "@/components/vyron-order-engine/ui";

type Settings = {
  b2cCustomerId: string | null;
  b2cCustomerName?: string | null;
  productNameMatching: "review" | "off";
  duplicatePoAction: "warn" | "block";
  minLeadTimeDays: number | null;
  configured: boolean;
};

type Loaded = { kind: "ok"; settings: Settings } | { kind: "not_enabled" } | { kind: "error"; error: string };

async function fetchSettings(): Promise<Loaded> {
  try {
    const res = await fetch("/api/order-intake/settings", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.code === "NOT_ENABLED") return { kind: "not_enabled" };
    if (!res.ok || !data.ok) return { kind: "error", error: data.error || "Could not load ordering settings." };
    return { kind: "ok", settings: data.settings };
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "Could not load ordering settings." };
  }
}

/**
 * Company ordering settings. Every setting starts conservative: no B2C account
 * (unknown web customers stop in Exceptions), name matching with review,
 * repeated POs warned, lead time not checked.
 */
export default function OrderSettingsCard({ canManage }: { canManage: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; customer_name: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSettings().then((result) => {
      if (cancelled) return;
      setLoaded(result);
      if (result.kind === "ok") setDraft(result.settings);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function searchCustomers(q: string) {
    setCustomerQuery(q);
    if (q.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const res = await fetch(`/api/order-intake/lookup?type=customer&q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setCustomerResults(Array.isArray(data.results) ? data.results : []);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/order-intake/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          b2cCustomerId: draft.b2cCustomerId,
          productNameMatching: draft.productNameMatching,
          duplicatePoAction: draft.duplicatePoAction,
          minLeadTimeDays: draft.minLeadTimeDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save.");
      setDraft({ ...data.settings, b2cCustomerName: draft.b2cCustomerName });
      setMessage({ tone: "success", text: "Ordering settings saved. They apply from the next validation." });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  if (loaded === null) return null;
  if (loaded.kind === "not_enabled") return null;
  if (loaded.kind === "error") return <Notice tone="error">{loaded.error}</Notice>;
  if (!draft) return null;

  const disabled = !canManage || saving;
  const label = "text-[10px] font-black uppercase tracking-[0.13em] text-slate-500";
  const field = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:bg-slate-50";

  return (
    <Card title="Ordering settings">
      <p className="mb-4 max-w-3xl text-sm font-semibold text-slate-500">
        Company-wide decisions the Order Engine needs. Until a setting is chosen it stays conservative — nothing is assumed for your business.
        {loaded.settings.configured ? null : " No settings have been saved yet."}
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className={label}>B2C account for web orders</div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            The customer account web-store orders from unknown customers are booked against. Not set: such orders stop in Exceptions for a person.
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm font-black text-slate-900">
            {draft.b2cCustomerId ? draft.b2cCustomerName || draft.b2cCustomerId : <span className="font-semibold text-slate-400">Not set</span>}
            {draft.b2cCustomerId && canManage ? (
              <SecondaryButton onClick={() => setDraft({ ...draft, b2cCustomerId: null, b2cCustomerName: null })}>Clear</SecondaryButton>
            ) : null}
          </div>
          {canManage ? (
            <>
              <input className={field} placeholder="Search customers…" value={customerQuery} onChange={(e) => void searchCustomers(e.target.value)} />
              {customerResults.length ? (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-100">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50"
                      onClick={() => {
                        setDraft({ ...draft, b2cCustomerId: c.id, b2cCustomerName: c.customer_name });
                        setCustomerResults([]);
                        setCustomerQuery("");
                      }}
                    >
                      {c.customer_name || c.id}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="grid gap-4">
          <label>
            <span className={label}>Product-name matching</span>
            <select
              className={field}
              disabled={disabled}
              value={draft.productNameMatching}
              onChange={(e) => setDraft({ ...draft, productNameMatching: e.target.value as Settings["productNameMatching"] })}
            >
              <option value="review">Exact name only, raised for review (lines without a SKU)</option>
              <option value="off">Off — lines without a SKU always need a person</option>
            </select>
          </label>
          <label>
            <span className={label}>Repeated customer PO / order reference</span>
            <select
              className={field}
              disabled={disabled}
              value={draft.duplicatePoAction}
              onChange={(e) => setDraft({ ...draft, duplicatePoAction: e.target.value as Settings["duplicatePoAction"] })}
            >
              <option value="warn">Warn — the approver acknowledges it</option>
              <option value="block">Block — stops in Exceptions</option>
            </select>
          </label>
          <label>
            <span className={label}>Minimum lead time (days)</span>
            <input
              className={field}
              disabled={disabled}
              inputMode="numeric"
              placeholder="Not checked"
              value={draft.minLeadTimeDays ?? ""}
              onChange={(e) => setDraft({ ...draft, minLeadTimeDays: e.target.value.trim() === "" ? null : Number(e.target.value) })}
            />
          </label>
        </div>
      </div>
      {message ? (
        <div className="mt-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}
      {canManage ? (
        <div className="mt-4">
          <PrimaryButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save ordering settings"}
          </PrimaryButton>
        </div>
      ) : (
        <p className="mt-4 text-xs font-semibold text-slate-500">Only members who can approve orders can change these settings.</p>
      )}
    </Card>
  );
}
