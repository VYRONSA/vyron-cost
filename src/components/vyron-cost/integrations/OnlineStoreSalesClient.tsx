"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, KpiCard, Notice, Pill, PrimaryButton, SecondaryButton, money, when } from "@/components/vyron-order-engine/ui";

type Channel = "SHOPIFY" | "WOOCOMMERCE";
type Issue = { code: string; message: string; key?: string | null; lineName?: string | null; detail?: Record<string, string | null> };

type Connection = {
  id: string;
  channel: Channel;
  store_url: string;
  store_key: string;
  display_name: string | null;
  status: "DISABLED" | "ACTIVE" | "SUSPENDED";
  default_customer_id: string | null;
  expected_currency: string;
  webhook_subscriptions: Array<{ id: string; topic: string; uri: string }>;
  last_webhook_at: string | null;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  credentials: "CONFIGURED" | "MISSING" | "OTHER_COMPANY";
  health: "NOT_CONNECTED" | "CONNECTED" | "ERROR";
  healthReason: string | null;
  totals: { ordersImported: number; invoicesImported: number; refunds: number; needsAttention: number };
};

type OrderRow = {
  id: string;
  external_order_id: string;
  order_number: string | null;
  order_created_at: string | null;
  financial_status: string | null;
  total_price: number | null;
  currency: string | null;
  customer_display: string | null;
  status: "PENDING" | "WAITING" | "IMPORTED" | "NEEDS_ATTENTION" | "FAILED" | "SKIPPED";
  issues: Issue[];
  invoice_number: string | null;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type Backfill = { id: string; status: "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED"; created_from: string; created_to: string | null; pages: number; orders_seen: number; last_error: string | null };
type Counts = { discovered: number; imported: number; alreadyImported: number; needsAttention: number; waiting: number; failed: number; skipped: number; pending: number };
type LogRow = { id: string; event_type: string; actor: string; detail: string | null; created_at: string };
type Loaded = { connections: Connection[]; companyId: string; webhookUrls: Record<Channel, string>; can: { manage: boolean; resolve: boolean; import: boolean } };

const LABEL: Record<Channel, string> = { SHOPIFY: "Shopify", WOOCOMMERCE: "WooCommerce" };
const ORDER_STATUS_LABEL: Record<OrderRow["status"], string> = {
  PENDING: "Queued",
  WAITING: "Awaiting payment",
  IMPORTED: "Imported",
  NEEDS_ATTENTION: "Needs attention",
  FAILED: "Failed — will retry",
  SKIPPED: "Not a sale",
};
const ORDER_STATUS_TONE: Record<OrderRow["status"], "slate" | "blue" | "green" | "amber" | "rose"> = {
  PENDING: "slate",
  WAITING: "blue",
  IMPORTED: "green",
  NEEDS_ATTENTION: "amber",
  FAILED: "rose",
  SKIPPED: "slate",
};
const HEALTH: Record<Connection["health"], { label: string; tone: "slate" | "green" | "rose" }> = {
  NOT_CONNECTED: { label: "Not Connected", tone: "slate" },
  CONNECTED: { label: "Connected", tone: "green" },
  ERROR: { label: "Error", tone: "rose" },
};

async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method || "GET",
    cache: "no-store",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const error = new Error(data.error || `Request failed (${res.status}).`) as Error & { code?: string };
    error.code = data.code;
    throw error;
  }
  return data as T;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800";
const labelClass = "grid gap-1 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500";
const statusText = (s: string) => s.replace(/_/g, " ").toLowerCase();

function LookupPicker({ type, onPick, placeholder }: { type: "product" | "customer"; onPick: (id: string, label: string) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; product_name?: string; sku?: string | null; customer_name?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const timer = setTimeout(() => {
      api<{ results: typeof results }>(`/api/order-intake/lookup?type=${type}&q=${encodeURIComponent(q.trim())}`)
        .then((data) => {
          setResults(data.results || []);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, type]);
  return (
    <div className="grid gap-1">
      <input
        className={inputClass}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) setResults([]);
        }}
      />
      {error ? <span className="text-xs font-semibold text-rose-700">{error}</span> : null}
      {results.length ? (
        <ul className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white">
          {results.map((r) => {
            const label = type === "product" ? `${r.product_name || "—"}${r.sku ? ` · ${r.sku}` : ""}` : String(r.customer_name || "—");
            return (
              <li key={r.id}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => onPick(r.id, label)}>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function IssueBlock({ issue, connectionId, canResolve, onDone }: { issue: Issue; connectionId: string; canResolve: boolean; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = issue.code.startsWith("PRODUCT_") ? "product" : issue.code.startsWith("CUSTOMER_") ? "customer" : null;
  const detail = issue.detail || {};
  const facts = [
    ["Source", detail.source],
    ["Order", detail.order],
    ["External product", detail.externalProductId],
    ["SKU", detail.sku],
    ["Product name", detail.productName],
    ["Customer id", detail.customerId],
    ["E-mail", detail.email],
  ].filter(([, value]) => value);
  const save = async (targetId: string, label: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ retried: { processed: number } }>("/api/integrations/store-sales/mappings", { method: "POST", body: { connectionId, kind, key: issue.key, targetId } });
      onDone(`Mapped to ${label}. ${result.retried.processed} waiting order(s) retried.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mapping failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2">
      <p className="text-sm font-semibold text-slate-800">{issue.message}</p>
      {facts.length ? (
        <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="inline text-slate-400">{label}: </dt>
              <dd className="inline">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {kind && issue.key && canResolve ? (
        <div className="mt-2 grid gap-1 md:max-w-md">
          <LookupPicker type={kind} placeholder={kind === "product" ? "Map to VOLORA product (name or SKU)…" : "Map to VOLORA customer…"} onPick={save} />
          {busy ? <span className="text-xs font-semibold text-slate-500">Saving and retrying…</span> : null}
          {error ? <span className="text-xs font-semibold text-rose-700">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ConnectForm({ channel, onCreated }: { channel: Channel; onCreated: (message: string) => void }) {
  const [storeUrl, setStoreUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-2">
      <label className={labelClass}>
        {channel === "SHOPIFY" ? "Store domain" : "Store URL"}
        <input className={inputClass} placeholder={channel === "SHOPIFY" ? "your-store.myshopify.com" : "https://shop.example.co.za"} value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} />
      </label>
      <div>
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/api/integrations/store-sales/connections", { method: "POST", body: { channel, storeUrl } });
              onCreated(`${LABEL[channel]} store added with its own online-sales customer. It stays off until its server credentials are in place and you activate it.`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not connect the store.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Connect {LABEL[channel]}
        </PrimaryButton>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

function ChannelCard({
  channel,
  connections,
  loaded,
  busy,
  onAction,
  onOpen,
  onMessage,
}: {
  channel: Channel;
  connections: Connection[];
  loaded: Loaded;
  busy: boolean;
  onAction: (connection: Connection, action: string) => void;
  onOpen: (connection: Connection, tab: Tab) => void;
  onMessage: (text: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card title={LABEL[channel]}>
      {!connections.length ? (
        <div className="grid gap-3 text-sm font-semibold text-slate-700">
          <div>
            Status: <Pill tone="slate">Not Connected</Pill>
          </div>
          {loaded.can.manage ? <ConnectForm channel={channel} onCreated={onMessage} /> : <p className="text-slate-500">An administrator connects the store.</p>}
        </div>
      ) : null}
      <div className="grid gap-5">
        {connections.map((c) => (
          <div key={c.id} className="grid gap-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm font-semibold text-slate-700">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <Pill tone={HEALTH[c.health].tone}>{HEALTH[c.health].label}</Pill>
                {c.healthReason ? <span className="ml-2 text-xs text-slate-500">{c.healthReason}</span> : null}
              </dd>
              <dt className="text-slate-500">Store</dt>
              <dd className="break-all">{c.store_url.replace(/^https:\/\//, "")}</dd>
              <dt className="text-slate-500">Last Sync</dt>
              <dd>{when(c.last_sync_at || c.last_success_at)}</dd>
              <dt className="text-slate-500">Orders Imported</dt>
              <dd className="tabular-nums">{c.totals.ordersImported}</dd>
              <dt className="text-slate-500">Invoices/Sales Imported</dt>
              <dd className="tabular-nums">{c.totals.invoicesImported}</dd>
              <dt className="text-slate-500">Refunds</dt>
              <dd className="tabular-nums">{c.totals.refunds}</dd>
              <dt className="text-slate-500">Needs attention</dt>
              <dd className="tabular-nums">{c.totals.needsAttention ? <button type="button" className="font-black text-amber-700" onClick={() => onOpen(c, "attention")}>{c.totals.needsAttention}</button> : 0}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton disabled={busy || c.credentials !== "CONFIGURED"} onClick={() => onAction(c, "test")}>
                Test Connection
              </SecondaryButton>
              <SecondaryButton disabled={busy || c.status !== "ACTIVE"} onClick={() => onAction(c, "sync_now")}>
                Sync Now
              </SecondaryButton>
              <SecondaryButton disabled={busy} onClick={() => onOpen(c, "log")}>
                View Sync Log
              </SecondaryButton>
              <SecondaryButton disabled={busy} onClick={() => onOpen(c, "attention")}>
                Orders &amp; import
              </SecondaryButton>
              {loaded.can.manage ? (
                c.status === "ACTIVE" ? (
                  <SecondaryButton tone="rose" disabled={busy} onClick={() => onAction(c, "disable")}>
                    Disable
                  </SecondaryButton>
                ) : (
                  <PrimaryButton disabled={busy || c.credentials !== "CONFIGURED"} onClick={() => onAction(c, "activate")}>
                    Activate
                  </PrimaryButton>
                )
              ) : null}
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
              <div>
                Webhook address: <span className="break-all font-black text-slate-800">{loaded.webhookUrls[channel]}</span>
              </div>
              {channel === "SHOPIFY" ? (
                <div className="mt-1">
                  Webhooks: {c.webhook_subscriptions.length ? c.webhook_subscriptions.map((s) => s.topic).join(", ") : "not registered"}
                  {loaded.can.manage && c.credentials === "CONFIGURED" ? (
                    <button type="button" className="ml-2 font-black text-blue-700" disabled={busy} onClick={() => onAction(c, "register_webhooks")}>
                      Register webhooks
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-1">Create the webhooks in WooCommerce → Settings → Advanced → Webhooks (topics Order created and Order updated). Last webhook: {when(c.last_webhook_at)}</div>
              )}
              {c.credentials !== "CONFIGURED" ? (
                <div className="mt-1 text-amber-800">
                  Server credentials {c.credentials === "MISSING" ? "not yet configured" : "are bound to another company"}. This company&apos;s id for the server configuration: <span className="font-black">{loaded.companyId}</span>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {connections.length && loaded.can.manage ? (
          adding ? (
            <ConnectForm channel={channel} onCreated={(text) => { setAdding(false); onMessage(text); }} />
          ) : (
            <button type="button" className="justify-self-start text-sm font-black text-blue-700" onClick={() => setAdding(true)}>
              + Connect another {LABEL[channel]} store
            </button>
          )
        ) : null}
      </div>
    </Card>
  );
}

function ImportCard({ connection, backfill, onChanged }: { connection: Connection; backfill: Backfill | null; onChanged: (message: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>, done: (data: Record<string, unknown>) => string) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(done(await api<Record<string, unknown>>("/api/integrations/store-sales/backfill", { method: "POST", body })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Historical import failed.");
    } finally {
      setBusy(false);
    }
  };
  const active = backfill && backfill.status !== "COMPLETED";
  return (
    <Card title="Historical import">
      <p className="mb-3 text-sm font-semibold text-slate-600">
        Brings existing {LABEL[connection.channel]} orders into VOLORA, 50 a page, oldest first. It can be paused and resumed, continues from where it stopped after an
        error, and an order is never imported twice.{connection.channel === "SHOPIFY" ? " Orders older than 60 days need Shopify's read_all_orders permission." : ""}
      </p>
      {backfill ? (
        <div className="my-3 grid gap-1 text-sm font-semibold text-slate-700">
          <div>
            <Pill tone={backfill.status === "COMPLETED" ? "green" : backfill.status === "FAILED" ? "rose" : backfill.status === "PAUSED" ? "amber" : "blue"}>{backfill.status}</Pill>{" "}
            {backfill.created_from} → {backfill.created_to || "today"} · {backfill.pages} page(s) · {backfill.orders_seen} order(s) found
          </div>
          {backfill.last_error ? <div className="text-rose-700">Last error: {backfill.last_error}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        {!active ? (
          <>
            <label className={labelClass}>
              From
              <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className={labelClass}>
              To (optional)
              <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <PrimaryButton disabled={busy || !from} onClick={() => run({ action: "start", connectionId: connection.id, from, to }, () => "Historical import started.")}>
              Start import
            </PrimaryButton>
          </>
        ) : null}
        {backfill?.status === "RUNNING" ? (
          <>
            <PrimaryButton disabled={busy} onClick={() => run({ action: "step", backfillId: backfill.id }, (d) => `Page imported: ${Number(d.recorded || 0)} order(s) found.`)}>
              Import next page now
            </PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => run({ action: "pause", backfillId: backfill.id }, () => "Paused.")}>
              Pause
            </SecondaryButton>
          </>
        ) : null}
        {backfill && (backfill.status === "PAUSED" || backfill.status === "FAILED") ? (
          <SecondaryButton disabled={busy} onClick={() => run({ action: "resume", backfillId: backfill.id }, () => "Resumed from where it stopped.")}>
            Resume
          </SecondaryButton>
        ) : null}
      </div>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
    </Card>
  );
}

type Tab = "attention" | "orders" | "log" | "import";

function StoreDetail({
  connection,
  can,
  version,
  initialTab,
  onMessage,
}: {
  connection: Connection;
  can: Loaded["can"];
  version: number;
  initialTab: Tab;
  onMessage: (text: string, tone?: "success" | "error") => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [overview, setOverview] = useState<{ counts: Counts; rows: OrderRow[]; backfill: Backfill | null } | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [filter, setFilter] = useState<OrderRow["status"] | "ALL">("ALL");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ counts: Counts; rows: OrderRow[]; backfill: Backfill | null }>(`/api/integrations/store-sales/orders?connectionId=${connection.id}&limit=300`)
      .then((data) => !cancelled && setOverview(data))
      .catch((e: Error) => !cancelled && onMessage(e.message, "error"));
    api<{ events: LogRow[] }>(`/api/integrations/store-sales/events?connectionId=${connection.id}&limit=200`)
      .then((data) => !cancelled && setLog(data.events))
      .catch(() => !cancelled && setLog([]));
    return () => {
      cancelled = true;
    };
  }, [connection.id, version, onMessage]);

  const retry = async (row: OrderRow) => {
    setBusy(true);
    try {
      const data = await api<{ outcome: string }>(`/api/integrations/store-sales/orders/${row.id}/retry`, { method: "POST", body: {} });
      onMessage(`${row.order_number || row.external_order_id}: ${data.outcome.replace(/_/g, " ")}.`);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Retry failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const attention = (overview?.rows || []).filter((row) => row.status === "NEEDS_ATTENTION" || row.status === "FAILED");
  const rows = (overview?.rows || []).filter((row) => filter === "ALL" || row.status === filter);
  const tabs: Array<[Tab, string]> = [
    ["attention", `Needs attention${attention.length ? ` (${attention.length})` : ""}`],
    ["orders", "Orders"],
    ["log", "Sync log"],
    ...(can.import ? ([["import", "Historical import"]] as Array<[Tab, string]>) : []),
  ];

  return (
    <section className="grid gap-4" id="store-detail">
      <h2 className="text-lg font-black text-slate-900">
        {LABEL[connection.channel]} · {connection.display_name || connection.store_url.replace(/^https:\/\//, "")}
      </h2>
      {overview ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiCard label="Orders discovered" value={String(overview.counts.discovered)} active={filter === "ALL" && tab === "orders"} onClick={() => { setFilter("ALL"); setTab("orders"); }} />
          <KpiCard label="Imported" value={String(overview.counts.imported)} onClick={() => { setFilter("IMPORTED"); setTab("orders"); }} />
          <KpiCard label="Already imported" value={String(overview.counts.alreadyImported)} onClick={() => setTab("log")} />
          <KpiCard label="Needs attention" value={String(overview.counts.needsAttention)} onClick={() => setTab("attention")} />
          <KpiCard label="Failed" value={String(overview.counts.failed)} onClick={() => setTab("attention")} />
          <KpiCard label="Awaiting payment" value={String(overview.counts.waiting)} onClick={() => { setFilter("WAITING"); setTab("orders"); }} />
          <KpiCard label="Not a sale" value={String(overview.counts.skipped)} onClick={() => { setFilter("SKIPPED"); setTab("orders"); }} />
        </section>
      ) : null}
      <nav className="flex flex-wrap gap-1 self-start rounded-2xl bg-slate-100 p-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-black ${tab === key ? "bg-white text-[#0B202B] shadow shadow-[inset_0_-2px_0_#E8B83F]" : "text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "attention" ? (
        <Card title="Needs attention">
          {!attention.length ? <p className="text-sm font-semibold text-slate-500">Nothing needs attention.</p> : null}
          <ul className="grid gap-4">
            {attention.map((row) => (
              <li key={row.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black text-slate-900">
                    {row.order_number || `Order ${row.external_order_id}`}{" "}
                    <span className="font-semibold text-slate-500">
                      · {when(row.order_created_at)} · {row.customer_display || "—"} · {money(row.total_price)} {row.currency || ""}
                    </span>
                  </div>
                  {can.resolve ? (
                    <SecondaryButton disabled={busy || connection.status !== "ACTIVE"} onClick={() => retry(row)}>
                      Retry
                    </SecondaryButton>
                  ) : null}
                </div>
                {row.status === "FAILED" && row.last_error ? (
                  <p className="mt-2 text-sm font-semibold text-rose-700">
                    {row.last_error}
                    {row.next_attempt_at ? ` — retrying automatically after ${when(row.next_attempt_at)}.` : " — automatic retries stopped; retry once the cause is fixed."}
                  </p>
                ) : null}
                {(row.issues || []).map((issue, index) => (
                  <IssueBlock key={`${issue.code}-${index}`} issue={issue} connectionId={connection.id} canResolve={can.resolve} onDone={(text) => onMessage(text)} />
                ))}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {tab === "orders" ? (
        <Card title={filter === "ALL" ? "Orders" : `Orders — ${ORDER_STATUS_LABEL[filter]}`}>
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Placed</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3">Store status</th>
                  <th className="py-2 pr-3">Sync</th>
                  <th className="py-2 pr-3">VOLORA invoice</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 font-semibold text-slate-700">
                    <td className="py-2 pr-3 font-black text-slate-900">{row.order_number || row.external_order_id}</td>
                    <td className="py-2 pr-3">{when(row.order_created_at)}</td>
                    <td className="py-2 pr-3">{row.customer_display || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(row.total_price)}</td>
                    <td className="py-2 pr-3">{row.financial_status ? statusText(row.financial_status) : "—"}</td>
                    <td className="py-2 pr-3">
                      <Pill tone={ORDER_STATUS_TONE[row.status]}>{ORDER_STATUS_LABEL[row.status]}</Pill>
                    </td>
                    <td className="py-2 pr-3">
                      {row.invoice_number ? (
                        <Link className="font-black text-blue-700" href={`/customer-invoices/${encodeURIComponent(row.invoice_number)}`}>
                          {row.invoice_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-sm font-semibold text-slate-400">
                      No orders here yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "log" ? (
        <Card title="Sync log">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Detail</th>
                  <th className="py-2 pr-3">By</th>
                </tr>
              </thead>
              <tbody>
                {(log || []).map((event) => (
                  <tr key={event.id} className="border-t border-slate-100 align-top font-semibold text-slate-700">
                    <td className="whitespace-nowrap py-2 pr-3">{when(event.created_at)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-black text-slate-900">{statusText(event.event_type)}</td>
                    <td className="py-2 pr-3">{event.detail || "—"}</td>
                    <td className="py-2 pr-3 text-slate-500">{event.actor}</td>
                  </tr>
                ))}
                {log && !log.length ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm font-semibold text-slate-400">
                      Nothing logged yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "import" && can.import ? <ImportCard connection={connection} backfill={overview?.backfill || null} onChanged={(text) => onMessage(text)} /> : null}
    </section>
  );
}

export default function OnlineStoreSalesClient() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<Tab>("attention");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Loaded>("/api/integrations/store-sales/connections")
      .then((data) => !cancelled && setLoaded(data))
      .catch((e: Error & { code?: string }) => {
        if (cancelled) return;
        if (e.code === "NOT_ENABLED") setNotEnabled(true);
        else setMessage({ tone: "error", text: e.message || "Could not load stores." });
        setLoaded({ connections: [], companyId: "", webhookUrls: { SHOPIFY: "", WOOCOMMERCE: "" }, can: { manage: false, resolve: false, import: false } });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = useCallback((text?: string, tone: "success" | "error" | "warning" = "success") => {
    if (text) setMessage({ tone, text });
    setVersion((v) => v + 1);
  }, []);

  const act = async (connection: Connection, action: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await api<Record<string, unknown>>(`/api/integrations/store-sales/connections/${connection.id}`, { method: "POST", body: { action } });
      const result = data.result as { detail?: string; currencyWarning?: string | null } | undefined;
      const processed = data.processed as { processed?: number } | undefined;
      const text =
        action === "test"
          ? `Connected: ${result?.detail || "OK"}${result?.currencyWarning ? ` — ${result.currencyWarning}` : ""}`
          : action === "sync_now"
            ? `Sync complete: ${Number(data.discovered || 0)} recently changed order(s) checked, ${Number(processed?.processed || 0)} processed.`
            : action === "activate"
              ? "Sync active: new orders are now recorded automatically."
              : action === "register_webhooks"
                ? "Shopify will now send order and refund events to VOLORA."
                : "Sync disabled. Incoming orders are kept and processed once it is active again.";
      refresh(text, result?.currencyWarning ? "warning" : "success");
    } catch (e) {
      refresh(e instanceof Error ? e.message : "Action failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const selected = useMemo(() => loaded?.connections.find((c) => c.id === selectedId) || null, [loaded, selectedId]);
  const onMessage = useCallback((text: string, tone: "success" | "error" = "success") => refresh(text, tone), [refresh]);

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Online Store Sales</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Every Shopify and WooCommerce order becomes a normal VOLORA customer invoice automatically — the same revenue, VAT, cost and gross-profit reporting as a
          sale captured here — and every refund becomes a credit note against it. Orders that cannot be recorded exactly wait for attention with the reason.
        </p>
      </div>
      {notEnabled ? <Notice tone="warning">Online store sales sync is not enabled for this database yet. It becomes available once its database change has been reviewed and applied.</Notice> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {loaded === null ? <div className="py-10 text-center text-sm font-semibold text-slate-400">Loading…</div> : null}
      {loaded && !notEnabled ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {(["SHOPIFY", "WOOCOMMERCE"] as Channel[]).map((channel) => (
            <ChannelCard
              key={channel}
              channel={channel}
              connections={loaded.connections.filter((c) => c.channel === channel)}
              loaded={loaded}
              busy={busy}
              onAction={act}
              onOpen={(c, tab) => {
                setSelectedId(c.id);
                setOpenTab(tab);
              }}
              onMessage={(text) => refresh(text)}
            />
          ))}
        </div>
      ) : null}
      {selected && loaded ? <StoreDetail key={`${selected.id}-${openTab}`} connection={selected} can={loaded.can} version={version} initialTab={openTab} onMessage={onMessage} /> : null}
    </div>
  );
}
