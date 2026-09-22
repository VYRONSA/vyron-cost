"use client";

import { useEffect, useState } from "react";
import { Card, Notice, Pill, PrimaryButton, SecondaryButton } from "@/components/vyron-order-engine/ui";

type Settings = {
  b2cCustomerId: string | null;
  b2cCustomerName?: string | null;
  productNameMatching: "review" | "off";
  duplicatePoAction: "warn" | "block";
  minLeadTimeDays: number | null;
  webOrdersMode: "history_only" | "fulfil" | null;
  webOrderStatuses: string[] | null;
  webPricesIncludeTax: boolean | null;
  shippingTreatment: "not_carried" | "separate_line" | "absorbed" | null;
  refundTreatment: "never_netted" | "credit_note" | "reject_order" | null;
  skuAlignment: "source_equals_vyron" | "mapping_required" | null;
  creatorCanApprove: boolean | null;
  pdfExtractor: string | null;
  configured: boolean;
};

type Decision = { id: string; title: string; state: "CONFIGURED" | "AWAITING_DECISION"; current: string; untilDecided: string; blocks: boolean; setIn: string };
type Channel = { id: string; channel_key: string; label: string | null; enabled: boolean; prices_include_tax: boolean | null; eligible_statuses: string[] | null; updated_at: string };
type Mailbox = {
  id: string;
  receiving_address: string;
  label: string | null;
  provider: string | null;
  status: "ACTIVE" | "DISABLED";
  allowed_sender_domains: string[] | null;
  allowed_senders: string[] | null;
  require_verified_sender: boolean;
  max_attachment_bytes: number | null;
};

type Loaded =
  | { kind: "ok"; settings: Settings; decisions: Decision[]; channels: Channel[]; mailboxes: Mailbox[] }
  | { kind: "not_enabled" }
  | { kind: "error"; error: string };

async function fetchConfiguration(): Promise<Loaded> {
  try {
    const res = await fetch("/api/order-intake/settings", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.code === "NOT_ENABLED") return { kind: "not_enabled" };
    if (!res.ok || !data.ok) return { kind: "error", error: data.error || "Could not load ordering settings." };
    return { kind: "ok", settings: data.settings, decisions: data.decisions || [], channels: data.channels || [], mailboxes: data.mailboxes || [] };
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "Could not load ordering settings." };
  }
}

const LABEL = "text-[10px] font-black uppercase tracking-[0.13em] text-slate-500";
const FIELD = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:bg-slate-50";
const list = (value: string) => value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);

/**
 * Company ordering configuration: the decision register, the company settings,
 * the order channels and the receiving mailboxes. Every decision starts
 * "awaiting": nothing about the business is assumed.
 */
export default function OrderSettingsCard({ canManage }: { canManage: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; customer_name: string | null }>>([]);
  const [channelDraft, setChannelDraft] = useState({ channelKey: "", label: "", enabled: true, pricesIncludeTax: "", eligibleStatuses: "" });
  const [mailboxDraft, setMailboxDraft] = useState({ receivingAddress: "", label: "", provider: "", status: "DISABLED", allowedSenderDomains: "", allowedSenders: "", requireVerifiedSender: false });
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchConfiguration().then((result) => {
      if (cancelled) return;
      setLoaded(result);
      if (result.kind === "ok") setDraft(result.settings);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    const result = await fetchConfiguration();
    setLoaded(result);
    if (result.kind === "ok") setDraft(result.settings);
  }

  async function send(what: string, url: string, method: "PUT" | "DELETE", body?: unknown, success?: string) {
    setSaving(what);
    setMessage(null);
    try {
      const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save.");
      await reload();
      setMessage({ tone: "success", text: success || "Saved. It applies from the next validation." });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(null);
    }
  }

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

  if (loaded === null || loaded.kind === "not_enabled") return null;
  if (loaded.kind === "error") return <Notice tone="error">{loaded.error}</Notice>;
  if (!draft) return null;
  const disabled = !canManage || saving !== null;
  const awaiting = loaded.decisions.filter((d) => d.state === "AWAITING_DECISION");

  return (
    <>
      <Card title={`Decisions (${loaded.decisions.length - awaiting.length} of ${loaded.decisions.length} made)`}>
        <p className="mb-4 max-w-3xl text-sm font-semibold text-slate-500">
          What the Order Engine needs the business to decide. Nothing is assumed: until a decision is made, the column on the right is exactly what happens.
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[3rem_1.6fr_0.8fr_1.2fr_1.6fr] gap-3 border-b border-slate-100 pb-2 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">
              <div>Ref</div>
              <div>Decision</div>
              <div>State</div>
              <div>Configured as</div>
              <div>Until decided</div>
            </div>
            {loaded.decisions.map((d) => (
              <div key={d.id} className="grid grid-cols-[3rem_1.6fr_0.8fr_1.2fr_1.6fr] items-start gap-3 border-b border-slate-50 py-2.5 text-sm font-semibold text-slate-700">
                <div className="font-black text-slate-900">{d.id}</div>
                <div>
                  {d.title}
                  <div className="text-xs font-semibold text-slate-400">set in {d.setIn}</div>
                </div>
                <div>
                  {d.state === "CONFIGURED" ? <Pill tone="green">Decided</Pill> : d.blocks ? <Pill tone="rose">Blocks orders</Pill> : <Pill tone="amber">Awaiting</Pill>}
                </div>
                <div className="text-xs">{d.current}</div>
                <div className="text-xs text-slate-500">{d.untilDecided}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Ordering settings">
        <p className="mb-4 max-w-3xl text-sm font-semibold text-slate-500">
          Company-wide rules. These apply to every customer unless a customer rule below overrides them.
          {loaded.settings.configured ? null : " No settings have been saved yet."}
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-4">
            <div>
              <div className={LABEL}>B2C account for web orders (D2)</div>
              <p className="mt-1 text-xs font-semibold text-slate-500">Not set: a web order from an unknown customer stops in Exceptions.</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-black text-slate-900">
                {draft.b2cCustomerId ? draft.b2cCustomerName || draft.b2cCustomerId : <span className="font-semibold text-slate-400">Not set</span>}
                {draft.b2cCustomerId && canManage ? <SecondaryButton onClick={() => setDraft({ ...draft, b2cCustomerId: null, b2cCustomerName: null })}>Clear</SecondaryButton> : null}
              </div>
              {canManage ? (
                <>
                  <input className={FIELD} placeholder="Search customers…" value={customerQuery} onChange={(e) => void searchCustomers(e.target.value)} />
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
            <label>
              <span className={LABEL}>Web-store orders (D1)</span>
              <select className={FIELD} disabled={disabled} value={draft.webOrdersMode ?? ""} onChange={(e) => setDraft({ ...draft, webOrdersMode: (e.target.value || null) as Settings["webOrdersMode"] })}>
                <option value="">Not decided — web orders are held</option>
                <option value="fulfil">Fulfilled in VOLORA</option>
                <option value="history_only">Historical sales only (not received)</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>Store prices include VAT (D3, default for every channel)</span>
              <select
                className={FIELD}
                disabled={disabled}
                value={draft.webPricesIncludeTax === null ? "" : draft.webPricesIncludeTax ? "yes" : "no"}
                onChange={(e) => setDraft({ ...draft, webPricesIncludeTax: e.target.value === "" ? null : e.target.value === "yes" })}
              >
                <option value="">Not decided</option>
                <option value="yes">Yes — prices include VAT</option>
                <option value="no">No — prices exclude VAT</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>Shipping (D4)</span>
              <select className={FIELD} disabled={disabled} value={draft.shippingTreatment ?? ""} onChange={(e) => setDraft({ ...draft, shippingTreatment: (e.target.value || null) as Settings["shippingTreatment"] })}>
                <option value="">Not decided — shown as a warning, not carried</option>
                <option value="not_carried">Never carried onto the sales order</option>
                <option value="separate_line">Billed as a separate line (added by a person)</option>
                <option value="absorbed">Absorbed — not billed</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4">
            <label>
              <span className={LABEL}>Refunded web orders</span>
              <select className={FIELD} disabled={disabled} value={draft.refundTreatment ?? ""} onChange={(e) => setDraft({ ...draft, refundTreatment: (e.target.value || null) as Settings["refundTreatment"] })}>
                <option value="">Not decided — a refund is shown as a warning, never netted</option>
                <option value="never_netted">Never netted — the refund is handled outside the order</option>
                <option value="credit_note">A credit note is raised separately</option>
                <option value="reject_order">The order is rejected and handled by a person</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>Source SKUs (D9)</span>
              <select className={FIELD} disabled={disabled} value={draft.skuAlignment ?? ""} onChange={(e) => setDraft({ ...draft, skuAlignment: (e.target.value || null) as Settings["skuAlignment"] })}>
                <option value="">Not decided</option>
                <option value="source_equals_vyron">Source SKUs are VOLORA SKUs</option>
                <option value="mapping_required">A mapping is required per customer / channel</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>Product-name matching (D7)</span>
              <select className={FIELD} disabled={disabled} value={draft.productNameMatching} onChange={(e) => setDraft({ ...draft, productNameMatching: e.target.value as Settings["productNameMatching"] })}>
                <option value="review">Exact name only, raised for review (lines without a SKU)</option>
                <option value="off">Off — lines without a SKU always need a person</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>Repeated customer PO / order reference (D6)</span>
              <select className={FIELD} disabled={disabled} value={draft.duplicatePoAction} onChange={(e) => setDraft({ ...draft, duplicatePoAction: e.target.value as Settings["duplicatePoAction"] })}>
                <option value="warn">Warn — the approver acknowledges it</option>
                <option value="block">Block — stops in Exceptions</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>Minimum lead time in days (D8)</span>
              <input
                className={FIELD}
                disabled={disabled}
                inputMode="numeric"
                placeholder="Not checked"
                value={draft.minLeadTimeDays ?? ""}
                onChange={(e) => setDraft({ ...draft, minLeadTimeDays: e.target.value.trim() === "" ? null : Number(e.target.value) })}
              />
            </label>
            <label>
              <span className={LABEL}>May the person who enters an order approve it? (D11)</span>
              <select
                className={FIELD}
                disabled={disabled}
                value={draft.creatorCanApprove === null ? "" : draft.creatorCanApprove ? "yes" : "no"}
                onChange={(e) => setDraft({ ...draft, creatorCanApprove: e.target.value === "" ? null : e.target.value === "yes" })}
              >
                <option value="">Not decided</option>
                <option value="yes">Yes</option>
                <option value="no">No — someone else must approve</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>PDF extractor (D12)</span>
              <input className={FIELD} disabled={disabled} placeholder="None configured" value={draft.pdfExtractor ?? ""} onChange={(e) => setDraft({ ...draft, pdfExtractor: e.target.value.trim() || null })} />
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
            <PrimaryButton onClick={() => void send("settings", "/api/order-intake/settings", "PUT", draft)} disabled={saving !== null}>
              {saving === "settings" ? "Saving…" : "Save ordering settings"}
            </PrimaryButton>
          </div>
        ) : (
          <p className="mt-4 text-xs font-semibold text-slate-500">Only members who can approve orders can change these settings.</p>
        )}
      </Card>

      <Card title={`Order channels (${loaded.channels.length})`}>
        <p className="mb-3 max-w-3xl text-sm font-semibold text-slate-500">
          One row per web store. A channel states its own VAT basis and which statuses mean &quot;ready to fulfil&quot; (D3, D10). No store is connected.
        </p>
        {loaded.channels.length ? (
          <div className="mb-4 grid gap-2">
            {loaded.channels.map((c) => (
              <div key={c.id} className="grid grid-cols-[1.4fr_0.6fr_0.8fr_1.4fr] items-center gap-3 rounded-xl border border-slate-100 p-2 text-sm font-semibold text-slate-700">
                <span className="font-black text-slate-900">
                  {c.channel_key}
                  {c.label ? <span className="ml-2 text-xs font-semibold text-slate-400">{c.label}</span> : null}
                </span>
                <span>{c.enabled ? <Pill tone="green">Enabled</Pill> : <Pill tone="slate">Off</Pill>}</span>
                <span className="text-xs">{c.prices_include_tax === null ? "VAT basis not stated" : c.prices_include_tax ? "Prices include VAT" : "Prices exclude VAT"}</span>
                <span className="text-xs text-slate-500">{c.eligible_statuses?.length ? `Fulfils: ${c.eligible_statuses.join(", ")}` : "Every status received for review"}</span>
              </div>
            ))}
          </div>
        ) : null}
        {canManage ? (
          <div className="grid gap-3 rounded-xl border border-dashed border-slate-200 p-3 md:grid-cols-5">
            <input className={FIELD} placeholder="woocommerce:main-store" value={channelDraft.channelKey} onChange={(e) => setChannelDraft({ ...channelDraft, channelKey: e.target.value })} />
            <input className={FIELD} placeholder="Label" value={channelDraft.label} onChange={(e) => setChannelDraft({ ...channelDraft, label: e.target.value })} />
            <select className={FIELD} value={channelDraft.pricesIncludeTax} onChange={(e) => setChannelDraft({ ...channelDraft, pricesIncludeTax: e.target.value })}>
              <option value="">VAT basis not stated</option>
              <option value="yes">Prices include VAT</option>
              <option value="no">Prices exclude VAT</option>
            </select>
            <input className={FIELD} placeholder="processing, completed" value={channelDraft.eligibleStatuses} onChange={(e) => setChannelDraft({ ...channelDraft, eligibleStatuses: e.target.value })} />
            <PrimaryButton
              disabled={saving !== null || !channelDraft.channelKey.trim()}
              onClick={() =>
                void send("channel", "/api/order-intake/channels", "PUT", {
                  channelKey: channelDraft.channelKey,
                  label: channelDraft.label || null,
                  enabled: channelDraft.enabled,
                  pricesIncludeTax: channelDraft.pricesIncludeTax === "" ? null : channelDraft.pricesIncludeTax === "yes",
                  eligibleStatuses: list(channelDraft.eligibleStatuses),
                })
              }
            >
              {saving === "channel" ? "Saving…" : "Save channel"}
            </PrimaryButton>
          </div>
        ) : null}
      </Card>

      <Card title={`Receiving mailboxes (${loaded.mailboxes.length})`}>
        <p className="mb-3 max-w-3xl text-sm font-semibold text-slate-500">
          The address customers send orders to decides which workspace the order belongs to — never anything inside the message. No mailbox is connected: a
          provider connector must still be activated. Messages from senders outside a mailbox&apos;s policy are held in the Exception Centre.
        </p>
        {loaded.mailboxes.length ? (
          <div className="mb-4 grid gap-2">
            {loaded.mailboxes.map((m) => (
              <div key={m.id} className="grid grid-cols-[1.4fr_0.6fr_1.6fr_0.8fr_0.5fr] items-center gap-3 rounded-xl border border-slate-100 p-2 text-sm font-semibold text-slate-700">
                <span className="font-black text-slate-900">{m.receiving_address}</span>
                <span>{m.status === "ACTIVE" ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Disabled</Pill>}</span>
                <span className="text-xs">
                  {(m.allowed_senders?.length || m.allowed_sender_domains?.length)
                    ? `Accepts: ${[...(m.allowed_senders || []), ...(m.allowed_sender_domains || []).map((d) => `@${d}`)].join(", ")}`
                    : "No sender policy — every message is held for a person"}
                </span>
                <span className="text-xs text-slate-500">{m.require_verified_sender ? "Verified senders only" : "Verification not required"}</span>
                {canManage ? (
                  <SecondaryButton tone="rose" disabled={saving !== null} onClick={() => void send("mailbox", `/api/order-intake/mailboxes?id=${encodeURIComponent(m.id)}`, "DELETE", undefined, "Mailbox removed.")}>
                    Remove
                  </SecondaryButton>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        ) : null}
        {canManage ? (
          <div className="grid gap-3 rounded-xl border border-dashed border-slate-200 p-3 md:grid-cols-5">
            <input className={FIELD} placeholder="orders@yourcompany.co.za" value={mailboxDraft.receivingAddress} onChange={(e) => setMailboxDraft({ ...mailboxDraft, receivingAddress: e.target.value })} />
            <input className={FIELD} placeholder="Allowed sender domains" value={mailboxDraft.allowedSenderDomains} onChange={(e) => setMailboxDraft({ ...mailboxDraft, allowedSenderDomains: e.target.value })} />
            <input className={FIELD} placeholder="Allowed senders" value={mailboxDraft.allowedSenders} onChange={(e) => setMailboxDraft({ ...mailboxDraft, allowedSenders: e.target.value })} />
            <select className={FIELD} value={mailboxDraft.status} onChange={(e) => setMailboxDraft({ ...mailboxDraft, status: e.target.value })}>
              <option value="DISABLED">Disabled</option>
              <option value="ACTIVE">Active</option>
            </select>
            <PrimaryButton
              disabled={saving !== null || !mailboxDraft.receivingAddress.trim()}
              onClick={() =>
                void send("mailbox", "/api/order-intake/mailboxes", "PUT", {
                  receivingAddress: mailboxDraft.receivingAddress,
                  label: mailboxDraft.label || null,
                  provider: mailboxDraft.provider || null,
                  status: mailboxDraft.status,
                  allowedSenderDomains: list(mailboxDraft.allowedSenderDomains),
                  allowedSenders: list(mailboxDraft.allowedSenders),
                  requireVerifiedSender: mailboxDraft.requireVerifiedSender,
                })
              }
            >
              {saving === "mailbox" ? "Saving…" : "Save mailbox"}
            </PrimaryButton>
          </div>
        ) : null}
      </Card>
    </>
  );
}
