"use client";

import { useCallback, useEffect, useState } from "react";
import OrderSettingsCard from "@/components/vyron-order-engine/OrderSettingsCard";
import type { CustomerOrderPolicy } from "@/lib/order-engine/types";
import { Card, Notice, NotEnabledNotice, OrderEngineTabs, Pill, PrimaryButton, SecondaryButton, when } from "@/components/vyron-order-engine/ui";

type Mapping = {
  kind: "product_alias" | "customer_identity";
  id: string;
  key: string;
  customerId: string | null;
  productId: string | null;
  source: string | null;
  customerName?: string | null;
  productName?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type Policy = CustomerOrderPolicy & { customer_name?: string | null };
type Loaded = { policies: Policy[]; mappings: Mapping[] } | "not_enabled" | { error: string };

type PolicyForm = {
  customerId: string | null;
  customerName: string;
  requirePo: boolean;
  requireDeliveryDate: boolean;
  minOrderValue: string;
  minGpPct: string;
  enforceCaseQuantity: boolean;
  deliveryWeekdays: number[];
  specialInstructions: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function fetchAll(): Promise<Loaded> {
  try {
    const [p, m] = await Promise.all([fetch("/api/order-intake/policies", { cache: "no-store" }), fetch("/api/order-intake/mappings", { cache: "no-store" })]);
    const [pd, md] = await Promise.all([p.json().catch(() => ({})), m.json().catch(() => ({}))]);
    if ((p.status === 503 && pd.code === "NOT_ENABLED") || (m.status === 503 && md.code === "NOT_ENABLED")) return "not_enabled";
    if (!p.ok || !pd.ok) return { error: pd.error || "Could not load ordering rules." };
    if (!m.ok || !md.ok) return { error: md.error || "Could not load mappings." };
    return { policies: pd.policies || [], mappings: md.mappings || [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load." };
  }
}

const toForm = (policy: CustomerOrderPolicy | undefined, customerId: string | null, customerName: string): PolicyForm => ({
  customerId,
  customerName,
  requirePo: Boolean(policy?.require_po),
  requireDeliveryDate: Boolean(policy?.require_delivery_date),
  minOrderValue: policy?.min_order_value === null || policy?.min_order_value === undefined ? "" : String(policy.min_order_value),
  minGpPct: policy?.min_gp_pct === null || policy?.min_gp_pct === undefined ? "" : String(policy.min_gp_pct),
  enforceCaseQuantity: Boolean(policy?.enforce_case_quantity),
  deliveryWeekdays: policy?.delivery_weekdays || [],
  specialInstructions: policy?.special_instructions || "",
});

export default function OrderRulesClient({ canManage }: { canManage: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, setForm] = useState<PolicyForm | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; customer_name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(() => fetchAll().then(setLoaded), []);

  if (loaded === null) return <div className="py-10 text-center text-sm font-semibold text-slate-400">Loading…</div>;
  if (loaded === "not_enabled") return <NotEnabledNotice />;
  if ("error" in loaded) return <Notice tone="error">{loaded.error}</Notice>;

  const policies = loaded.policies;
  const companyDefault = policies.find((p) => !p.customer_id);

  async function save() {
    if (!form) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/order-intake/policies", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: form.customerId,
          requirePo: form.requirePo,
          requireDeliveryDate: form.requireDeliveryDate,
          minOrderValue: form.minOrderValue.trim() === "" ? null : Number(form.minOrderValue),
          minGpPct: form.minGpPct.trim() === "" ? null : Number(form.minGpPct),
          enforceCaseQuantity: form.enforceCaseQuantity,
          deliveryWeekdays: form.deliveryWeekdays.length ? form.deliveryWeekdays : null,
          specialInstructions: form.specialInstructions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save.");
      setMessage({ tone: "success", text: `Ordering rules saved for ${form.customerName}. They apply the next time an order is validated.` });
      setForm(null);
      await reload();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(mapping: Mapping) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/order-intake/mappings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revoke", kind: mapping.kind, id: mapping.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not revoke.");
      setMessage({ tone: "success", text: "Mapping revoked. Future orders will no longer use it; past orders keep their history." });
      await reload();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not revoke." });
    } finally {
      setBusy(false);
    }
  }

  async function searchCustomers() {
    if (customerQuery.trim().length < 2) return;
    const res = await fetch(`/api/order-intake/lookup?type=customer&q=${encodeURIComponent(customerQuery.trim())}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setCustomerResults(data.ok ? data.results : []);
  }

  const describe = (p: CustomerOrderPolicy) =>
    [
      p.require_po ? "PO required" : null,
      p.require_delivery_date ? "delivery date required" : null,
      p.min_order_value !== null ? `min order ${Number(p.min_order_value).toFixed(2)}` : null,
      p.min_gp_pct !== null ? `min margin ${p.min_gp_pct}%` : null,
      p.enforce_case_quantity ? "whole cases" : null,
      p.delivery_weekdays?.length ? `delivers ${p.delivery_weekdays.map((d) => DAYS[d - 1]).join("/")}` : null,
      p.special_instructions ? "special instructions" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "No rules switched on";

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Order rules & mappings</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Optional ordering rules per customer (or a company default), and the item codes and customer references people have chosen to remember. Every
          rule is off until you switch it on. Prices come from the customer price lists; credit status and hold from the Customer Register.
        </p>
      </div>
      <OrderEngineTabs active="rules" />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <OrderSettingsCard canManage={canManage} />

      <Card title="Ordering rules">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm">
            <div>
              <div className="font-black text-slate-900">Company default</div>
              <div className="text-xs font-semibold text-slate-500">{companyDefault ? describe(companyDefault) : "Not set — no rules apply unless a customer has their own"}</div>
            </div>
            {canManage ? <SecondaryButton onClick={() => setForm(toForm(companyDefault, null, "the company default"))}>Edit</SecondaryButton> : null}
          </div>
          {policies
            .filter((p) => p.customer_id)
            .map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm">
                <div>
                  <div className="font-black text-slate-900">{p.customer_name || `Customer ${p.customer_id}`}</div>
                  <div className="text-xs font-semibold text-slate-500">{describe(p)}</div>
                  <div className="text-xs text-slate-400">Updated {when(p.updated_at)} by {p.updated_by_name || p.updated_by}</div>
                </div>
                {canManage ? <SecondaryButton onClick={() => setForm(toForm(p, p.customer_id, p.customer_name || `customer ${p.customer_id}`))}>Edit</SecondaryButton> : null}
              </div>
            ))}
        </div>

        {canManage ? (
          <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Add rules for a customer</div>
            <div className="flex gap-2">
              <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Search customers" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
              <SecondaryButton onClick={() => void searchCustomers()}>Search</SecondaryButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {customerResults.map((c) => (
                <SecondaryButton key={c.id} onClick={() => setForm(toForm(policies.find((p) => p.customer_id === c.id), c.id, c.customer_name))}>
                  {c.customer_name}
                </SecondaryButton>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs font-semibold text-slate-400">Only members who can approve orders can change ordering rules.</p>
        )}

        {form ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="text-sm font-black text-slate-900">Rules for {form.customerName}</div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.requirePo} onChange={(e) => setForm({ ...form, requirePo: e.target.checked })} /> A PO number is required
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.requireDeliveryDate} onChange={(e) => setForm({ ...form, requireDeliveryDate: e.target.checked })} /> A delivery date is required
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.enforceCaseQuantity} onChange={(e) => setForm({ ...form, enforceCaseQuantity: e.target.checked })} /> Warn when quantities are not whole cases (confirmed pack sizes only)
              </label>
              <div />
              <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Minimum order value (ex tax)
                <input value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} inputMode="decimal" placeholder="None" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
              </label>
              <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Minimum margin %
                <input value={form.minGpPct} onChange={(e) => setForm({ ...form, minGpPct: e.target.value })} inputMode="decimal" placeholder="None" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
              </label>
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Delivery days (none = any day)</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {DAYS.map((label, index) => {
                  const day = index + 1;
                  const on = form.deliveryWeekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setForm({ ...form, deliveryWeekdays: on ? form.deliveryWeekdays.filter((d) => d !== day) : [...form.deliveryWeekdays, day].sort() })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-black ${on ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Special instructions (shown to the approver)
              <textarea value={form.specialInstructions} onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })} rows={2} maxLength={2000} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
            </label>
            <div className="flex gap-2">
              <PrimaryButton disabled={busy} onClick={() => void save()}>
                Save rules
              </PrimaryButton>
              <SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton>
            </div>
          </div>
        ) : null}
      </Card>

      <Card title={`Remembered mappings (${loaded.mappings.length})`}>
        {loaded.mappings.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">None yet. When someone resolves an unmatched item code or customer, they can choose to remember it.</p>
        ) : (
          <div className="grid gap-2">
            {loaded.mappings.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm">
                <div>
                  <div className="flex items-center gap-2 font-black text-slate-900">
                    <Pill tone={m.kind === "product_alias" ? "blue" : "green"}>{m.kind === "product_alias" ? "Item code" : "Customer reference"}</Pill>
                    {m.key.replace(/^(sku|desc):/, "")}
                    {m.key.startsWith("desc:") ? <span className="text-xs font-semibold text-slate-400">(description)</span> : null}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {m.kind === "product_alias"
                      ? `→ ${m.productName || m.productId} · for ${m.customerName || m.customerId || "every customer"}`
                      : `→ ${m.customerName || m.customerId} · ${m.source} orders`}
                  </div>
                  <div className="text-xs text-slate-400">
                    Remembered {when(m.createdAt)} by {m.createdByName || m.createdBy}
                  </div>
                </div>
                {canManage ? (
                  <SecondaryButton tone="rose" disabled={busy} onClick={() => void revoke(m)}>
                    Revoke
                  </SecondaryButton>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
