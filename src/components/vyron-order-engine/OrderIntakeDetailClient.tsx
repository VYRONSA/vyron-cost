"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, CircleSlash, PauseCircle, RefreshCw, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { STATUS_LABEL, type IntakeAction } from "@/lib/order-engine/lifecycle";
import type { IntakeEventRow, IntakeLineRow, IntakeRow, LineEvaluation, ValidationIssue, ValidationSnapshot } from "@/lib/order-engine/types";
import {
  Card,
  IntakeStatusPill,
  Notice,
  NotEnabledNotice,
  Pill,
  PrimaryButton,
  SecondaryButton,
  SeverityPill,
  SOURCE_LABEL,
  money,
  qty,
  when,
} from "@/components/vyron-order-engine/ui";

type PresentedIssue = ValidationIssue & { title?: string; action?: string | null; ruleSource?: string | null };
type PresentedSnapshot = ValidationSnapshot & { issues: PresentedIssue[] };

type Detail = {
  intake: IntakeRow;
  lines: IntakeLineRow[];
  events: IntakeEventRow[];
  salesOrder: { id: string; order_number: string; status: string; total: number | null } | null;
  derived: { approvalStatus: string; fulfilmentStatus: string; invoiceStatus: string };
  permissions: { canSeeCost: boolean; canEdit: boolean; canRemember: boolean; actions: IntakeAction[] };
};

type LookupResult = { id: string; product_name?: string; customer_name?: string; sku?: string | null };
type LoadResult = { kind: "ok"; detail: Detail } | { kind: "not_enabled" } | { kind: "error"; error: string };

/** How a PRODUCT line was matched. */
const RULE_LABEL: Record<string, string> = {
  manual: "Chosen by a person",
  sku_exact: "Exact SKU",
  sku_normalized: "SKU (case / spaces)",
  customer_alias: "This customer's approved code",
  alias: "Approved alias",
  name_exact: "Exact name — review",
};

/** How the CUSTOMER was identified. An exact customer name is a normal match; only e-mail needs review. */
const CUSTOMER_RULE_LABEL: Record<string, string> = {
  customer_id: "Chosen by a person",
  identity_map: "Remembered customer reference",
  name_exact: "Exact name",
  sender_email: "Sender e-mail — review",
};

const humanise = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Pure fetch: returns the result, sets no state. */
async function fetchIntakeDetail(id: string): Promise<LoadResult> {
  const res = await fetch(`/api/order-intake/${id}`, { cache: "no-store" }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (res?.status === 503 && data.code === "NOT_ENABLED") return { kind: "not_enabled" };
  if (!res || !res.ok || !data.ok) return { kind: "error", error: data.error || "Could not load the order." };
  return { kind: "ok", detail: data as Detail };
}

/** The story of the order, from its audit events — nothing here is hard-coded. */
function timelineEntry(event: IntakeEventRow, salesOrderNumber: string | null): { label: string; detail?: string | null; tone: "slate" | "green" | "amber" | "rose" | "blue" } {
  const m = (event.metadata || {}) as Record<string, unknown>;
  switch (event.event_type) {
    case "RECEIVED":
      return { label: `Received (${SOURCE_LABEL[String(m.source)] || String(m.source || "")})`, detail: `${m.lineCount ?? "?"} line(s)`, tone: "blue" };
    case "RECEIVE_DUPLICATE":
      return { label: "Same order received again — ignored", tone: "slate" };
    case "VALIDATED":
    case "RELEASED": {
      const customer = m.customer as { matched?: boolean; rule?: string } | undefined;
      const matching = m.matching as { matched?: number; unmatched?: number; ambiguous?: number } | undefined;
      const parts = [
        customer ? (customer.matched ? `customer matched (${CUSTOMER_RULE_LABEL[String(customer.rule)] || customer.rule})` : "customer not identified") : null,
        matching ? `${matching.matched ?? 0} product(s) matched${matching.unmatched ? `, ${matching.unmatched} unmatched` : ""}${matching.ambiguous ? `, ${matching.ambiguous} ambiguous` : ""}` : null,
      ].filter(Boolean);
      return { label: event.event_type === "RELEASED" ? "Released from hold and re-validated" : "Validated", detail: parts.join(" · ") || event.detail, tone: "blue" };
    }
    case "EXCEPTION_RAISED":
      return { label: "Exception detected", detail: event.detail, tone: "rose" };
    case "LINE_RESOLVED":
    case "CUSTOMER_RESOLVED":
      return { label: "Exception resolved", detail: event.detail, tone: "green" };
    case "EDITED":
      return { label: "Order corrected", detail: event.detail, tone: "slate" };
    case "APPROVAL_REQUESTED":
      return { label: "Approval requested", tone: "amber" };
    case "APPROVAL_REVALIDATION_CHANGED":
      return { label: "Approval stopped — live data changed", detail: event.detail, tone: "amber" };
    case "HELD":
      return { label: "Placed on hold", detail: event.detail, tone: "amber" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", detail: event.detail, tone: "amber" };
    case "APPROVED":
      return { label: "Approved", detail: event.detail, tone: "green" };
    case "CONFIRMED":
      return { label: `Sales order ${String(m.salesOrderNumber || salesOrderNumber || "")} created`, detail: "Handed to Sales Orders as a Draft", tone: "green" };
    case "HANDOFF_FAILED":
      return { label: "Sales order not created", detail: event.detail, tone: "rose" };
    case "REJECTED":
      return { label: "Rejected", detail: event.detail, tone: "rose" };
    case "CANCELLED":
      return { label: "Cancelled", detail: event.detail, tone: "rose" };
    default:
      return { label: humanise(event.event_type), detail: event.detail, tone: "slate" };
  }
}

const DOT = { slate: "bg-slate-400", green: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", blue: "bg-blue-500" };

export default function OrderIntakeDetailClient({ id, duplicate }: { id: string; duplicate: boolean }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(duplicate ? "This order had already been received — you are looking at the existing order." : null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);

  const apply = useCallback((data: Detail) => {
    setDetail(data);
    setAcknowledge(false);
  }, []);
  const applyLoad = useCallback(
    (result: LoadResult) => {
      if (result.kind === "not_enabled") setNotEnabled(true);
      else if (result.kind === "error") setError(result.error);
      else apply(result.detail);
    },
    [apply]
  );

  useEffect(() => {
    let cancelled = false;
    fetchIntakeDetail(id).then((result) => {
      if (!cancelled) applyLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyLoad, id]);

  const load = () => fetchIntakeDetail(id).then(applyLoad);

  async function send(method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/order-intake/${id}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "The action failed.");
        // The server may have refreshed the validation (e.g. live data changed): show it.
        if (res.status === 409 || res.status === 502) await load();
        return false;
      }
      apply(data);
      setNotice(success);
      setReason("");
      return true;
    } finally {
      setBusy(false);
    }
  }
  const act = (action: IntakeAction, success: string, extra: Record<string, unknown> = {}) => send("POST", { action, ...extra }, success);

  if (notEnabled) return <NotEnabledNotice />;
  if (!detail) return error ? <Notice tone="error">{error}</Notice> : <div className="py-10 text-center text-sm font-semibold text-slate-400">Loading…</div>;

  const { intake, lines, events, salesOrder, derived, permissions } = detail;
  const snapshot = (intake.validation && "issues" in intake.validation ? intake.validation : null) as PresentedSnapshot | null;
  const issues = snapshot?.issues || [];
  const blocking = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  const can = (action: IntakeAction) => permissions.actions.includes(action);
  const taxBlock = issues.some((i) => i.code === "PRICES_INCLUDE_TAX");
  const stockIssues = issues.filter((i) => i.category === "stock" || i.category === "production");

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <Link href="/order-inbox" className="text-sm font-black text-blue-700">
          ← Order Inbox
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-slate-900">{intake.intake_number}</h1>
          <IntakeStatusPill status={intake.status} />
          <Pill>{SOURCE_LABEL[intake.source] || intake.source}</Pill>
          {blocking.length ? <Pill tone="rose">{blocking.length} blocking</Pill> : null}
          {warnings.length ? <Pill tone="amber">{warnings.length} warning{warnings.length === 1 ? "" : "s"}</Pill> : null}
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Received {when(intake.created_at)}
          {intake.source_reference ? ` · ${intake.source_reference}` : ""}
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatusTile label="Order" value={STATUS_LABEL[intake.status]} />
        <StatusTile label="Approval" value={humanise(derived.approvalStatus)} />
        <StatusTile label="Fulfilment" value={humanise(derived.fulfilmentStatus)} />
        <StatusTile label="Invoice" value={humanise(derived.invoiceStatus)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid min-w-0 content-start gap-6">
          <OrderSummary detail={detail} busy={busy} onResolveCustomer={(customerId, remember) => send("PATCH", { customerId, rememberCustomerReference: remember }, "Customer set. Validate the order again.")} />

          <Card title={`Order lines (${lines.length})`}>
            <LinesTable
              lines={lines}
              evaluations={snapshot?.lines || []}
              issues={issues}
              canSeeCost={permissions.canSeeCost}
              canEdit={permissions.canEdit}
              canRemember={permissions.canRemember}
              busy={busy}
              onResolve={(lineId, productId, remember) => send("PATCH", { resolveLines: [{ lineId, productId, remember }] }, remember ? "Product chosen and remembered for this customer. Validate the order again." : "Product chosen. Validate the order again.")}
              onUpdate={(lineId, patch) => send("PATCH", { updateLines: [{ lineId, ...patch }] }, "Line updated. Validate the order again.")}
            />
          </Card>

          <Card title="Timeline">
            <ol className="grid gap-3">
              {events.map((event) => {
                const entry = timelineEntry(event, salesOrder?.order_number || null);
                return (
                  <li key={event.id} className="grid grid-cols-[4.5rem_auto_1fr] items-start gap-3 text-sm">
                    <span className="pt-0.5 text-xs font-black text-slate-400">{new Date(event.created_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${DOT[entry.tone]}`} />
                    <div>
                      <div className="font-black text-slate-800">{entry.label}</div>
                      {entry.detail ? <div className="text-sm font-semibold text-slate-600">{entry.detail}</div> : null}
                      <div className="text-xs font-semibold text-slate-400">
                        {new Date(event.created_at).toLocaleDateString("en-ZA")} · {event.actor_name || event.actor}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <details className="rounded-3xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.13em] text-slate-500">Full audit trail ({events.length} events)</summary>
            <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600">
              {events.map((event) => (
                <div key={event.id} className="grid grid-cols-[10rem_12rem_1fr] gap-2 border-b border-slate-50 pb-1">
                  <span>{when(event.created_at)}</span>
                  <span className="font-black text-slate-800">
                    {event.event_type}
                    {event.from_status || event.to_status ? ` (${event.from_status || "—"} → ${event.to_status || "—"})` : ""}
                  </span>
                  <span>
                    {event.actor_name || event.actor}
                    {event.detail ? ` — ${event.detail}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Card title="Validation">
            {!snapshot ? (
              <p className="text-sm font-semibold text-slate-500">
                Not validated yet{intake.decision_note && intake.status === "RECEIVED" ? ` — changes requested: ${intake.decision_note}` : ""}.
              </p>
            ) : issues.length === 0 ? (
              <Notice tone="success">No issues. Validated {when(snapshot.validatedAt)}.</Notice>
            ) : (
              <div className="grid gap-4">
                <IssueGroup title="Blocking — must be resolved" issues={blocking} />
                <IssueGroup title="Warnings — acknowledge to approve" issues={warnings} />
                <IssueGroup title="Information" issues={infos} />
                <div className="text-xs font-semibold text-slate-400">Validated {when(snapshot.validatedAt)}{snapshot.policy ? ` · ${snapshot.policy.scope === "customer" ? "customer" : "company"} ordering rules applied` : ""}</div>
              </div>
            )}
            {taxBlock && permissions.canEdit ? (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/60 p-3 text-sm font-semibold text-rose-900">
                The source stated tax-inclusive prices. Correct each line to its ex-tax price, then confirm.
                <div className="mt-2">
                  <SecondaryButton tone="rose" disabled={busy} onClick={() => void send("PATCH", { confirmPricesExTax: true }, "Prices confirmed as ex-tax. Validate the order again.")}>
                    Line prices are now ex-tax
                  </SecondaryButton>
                </div>
              </div>
            ) : null}
          </Card>

          {snapshot ? (
            <Card title="Stock & production">
              {stockIssues.length === 0 ? (
                <p className="text-sm font-semibold text-emerald-700">All matched lines can be supplied from available stock.</p>
              ) : (
                <ul className="grid gap-2 text-sm font-semibold text-slate-700">
                  {stockIssues.map((issue, index) => (
                    <li key={index} className="flex gap-2">
                      <SeverityPill severity={issue.severity} />
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs font-semibold text-slate-400">Available = on hand minus stock reserved by other live sales orders. Nothing is reserved until the sales order is approved.</p>
            </Card>
          ) : null}

          {snapshot ? (
            <Card title="Financial summary">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="font-semibold text-slate-500">Order value (ex tax)</dt>
                <dd className="text-right font-black text-slate-900">{money(snapshot.totals.expectedSubtotal)}</dd>
                {intake.supplied_total !== null && intake.supplied_total !== undefined ? (
                  <>
                    <dt className="font-semibold text-slate-500">Total stated by the source</dt>
                    <dd className="text-right font-black text-slate-900">{money(intake.supplied_total)}</dd>
                  </>
                ) : null}
                {permissions.canSeeCost ? (
                  <>
                    <dt className="font-semibold text-slate-500">Expected cost</dt>
                    <dd className="text-right font-black text-slate-900">{money(snapshot.totals.expectedCost)}</dd>
                    <dt className="font-semibold text-slate-500">Expected gross profit</dt>
                    <dd className="text-right font-black text-slate-900">{money(snapshot.totals.expectedGp)}</dd>
                    <dt className="font-semibold text-slate-500">Expected margin</dt>
                    <dd className="text-right font-black text-slate-900">{snapshot.totals.expectedGpPct === null ? "Not measured" : `${snapshot.totals.expectedGpPct}%`}</dd>
                  </>
                ) : (
                  <p className="col-span-2 text-xs font-semibold text-slate-400">Cost and margin are visible to approvers.</p>
                )}
              </dl>
              {permissions.canSeeCost && snapshot.totals.marginNotMeasuredLines > 0 ? (
                <p className="mt-3 text-xs font-semibold text-slate-500">Margin not measured on {snapshot.totals.marginNotMeasuredLines} line(s): no product cost in VYRON.</p>
              ) : null}
              <p className="mt-3 text-xs font-semibold text-slate-400">Cost is the current product cost. Tax is added by Sales Orders at the workspace rate.</p>
            </Card>
          ) : null}

          <Card title="Decision">
            <div className="grid gap-3">
              {can("validate") ? (
                <PrimaryButton disabled={busy} onClick={() => void act("validate", "Validated.")}>
                  <ShieldCheck size={16} /> {intake.status === "EXCEPTION" ? "Validate again" : "Validate order"}
                </PrimaryButton>
              ) : null}

              {can("approve") ? (
                <div className="grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                  {warnings.length ? (
                    <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" className="mt-1" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} />
                      I have reviewed the {warnings.length} warning{warnings.length === 1 ? "" : "s"} and approve this order anyway.
                    </label>
                  ) : null}
                  <PrimaryButton
                    disabled={busy || (warnings.length > 0 && !acknowledge)}
                    onClick={() =>
                      void act("approve", "Approved — a Draft sales order was created.", { validationHash: intake.validation_hash, acknowledgeWarnings: acknowledge, reason: reason || null })
                    }
                  >
                    <Check size={16} /> Approve and create sales order
                  </PrimaryButton>
                  <p className="text-xs font-semibold text-slate-500">Creates a Draft in Sales Orders. Nothing is reserved, invoiced, e-mailed or sent to Xero.</p>
                </div>
              ) : null}

              {can("confirm") ? (
                <PrimaryButton disabled={busy} onClick={() => void act("confirm", "Sales order created.")}>
                  <RefreshCw size={16} /> Retry creating the sales order
                </PrimaryButton>
              ) : null}

              {(["hold", "request_changes", "reject", "cancel", "release"] as IntakeAction[]).some(can) ? (
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Reason / note
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                      placeholder="Required to hold, request changes, reject or cancel"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {can("release") ? (
                      <SecondaryButton disabled={busy} onClick={() => void act("release", "Released and re-validated.")}>
                        <RotateCcw size={15} /> Release hold
                      </SecondaryButton>
                    ) : null}
                    {can("hold") ? (
                      <SecondaryButton tone="amber" disabled={busy || !reason.trim()} onClick={() => void act("hold", "Placed on hold.", { reason })}>
                        <PauseCircle size={15} /> Hold
                      </SecondaryButton>
                    ) : null}
                    {can("request_changes") ? (
                      <SecondaryButton disabled={busy || !reason.trim()} onClick={() => void act("request_changes", "Returned for changes.", { reason })}>
                        <RotateCcw size={15} /> Request changes
                      </SecondaryButton>
                    ) : null}
                    {can("reject") ? (
                      <SecondaryButton tone="rose" disabled={busy || !reason.trim()} onClick={() => void act("reject", "Rejected.", { reason })}>
                        <XCircle size={15} /> Reject
                      </SecondaryButton>
                    ) : null}
                    {can("cancel") ? (
                      <SecondaryButton tone="rose" disabled={busy || !reason.trim()} onClick={() => void act("cancel", "Cancelled.", { reason })}>
                        <CircleSlash size={15} /> Cancel order
                      </SecondaryButton>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!permissions.actions.length && !salesOrder ? <p className="text-sm font-semibold text-slate-500">No action is available to you on this order.</p> : null}
              {intake.decision_note && ["ON_HOLD", "REJECTED", "CANCELLED"].includes(intake.status) ? (
                <Notice tone="info">
                  {STATUS_LABEL[intake.status]}: {intake.decision_note}
                </Notice>
              ) : null}
            </div>
          </Card>

          <Card title="Linked sales order">
            {salesOrder ? (
              <div className="grid gap-2 text-sm font-semibold text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Sales order</span>
                  <Link href="/customer-sales-orders" className="inline-flex items-center gap-1 font-black text-blue-700">
                    {salesOrder.order_number} <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="flex items-center justify-between">
                  <span>Status in Sales Orders</span>
                  <Pill tone="blue">{salesOrder.status}</Pill>
                </div>
                <p className="text-xs text-slate-500">
                  From here the existing VYRON workflow takes over: approval and stock reservation, picking, dispatch and invoicing in Sales Orders and the Order
                  Centre. Invoicing and Xero posting remain separate, deliberate steps.
                </p>
              </div>
            ) : intake.status === "APPROVED" ? (
              <Notice tone="warning">Approved, but the sales order has not been created yet. The timeline shows why; retry above once it is fixed.</Notice>
            ) : (
              <p className="text-sm font-semibold text-slate-500">A Draft sales order is created when this order is approved.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.08)]">
      <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-black text-slate-900">{value}</div>
    </div>
  );
}

function IssueGroup({ title, issues }: { title: string; issues: PresentedIssue[] }) {
  if (!issues.length) return null;
  return (
    <div>
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">{title}</div>
      <div className="grid gap-2">
        {issues.map((issue, index) => (
          <div key={`${issue.code}-${index}`} className="rounded-xl border border-slate-100 p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityPill severity={issue.severity} />
              <span className="font-black text-slate-900">{issue.title || issue.code}</span>
              {issue.lineNo ? <span className="text-xs font-black text-slate-400">Line {issue.lineNo}</span> : null}
              {issue.ruleSource === "policy" ? <Pill>customer rule</Pill> : null}
            </div>
            <div className="mt-1 font-semibold text-slate-700">{issue.message}</div>
            {issue.action && issue.severity !== "info" ? <div className="mt-1 text-xs font-semibold text-slate-500">Action: {issue.action}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderSummary({ detail, busy, onResolveCustomer }: { detail: Detail; busy: boolean; onResolveCustomer: (customerId: string, remember: boolean) => void }) {
  const { intake, permissions } = detail;
  const snapshot = (intake.validation && "issues" in intake.validation ? intake.validation : null) as PresentedSnapshot | null;
  const customerIssue = snapshot?.issues.find((i) => i.code === "CUSTOMER_NOT_FOUND" || i.code === "CUSTOMER_AMBIGUOUS");
  const candidates = (customerIssue?.data?.candidates as Array<{ id: string; name: string | null }> | undefined) || [];
  const [remember, setRemember] = useState(false);

  return (
    <Card title="Order summary">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Field label="Customer on the order" value={intake.customer_name || "Not stated"} />
        <Field
          label="Customer in VYRON"
          value={
            snapshot?.customer?.id ? (
              <span className="flex flex-wrap items-center gap-2">
                {snapshot.customer.name}
                {snapshot.customer.matchRule ? <Pill tone={snapshot.customer.matchRule === "sender_email" ? "amber" : "green"}>{CUSTOMER_RULE_LABEL[snapshot.customer.matchRule] || snapshot.customer.matchRule}</Pill> : null}
              </span>
            ) : snapshot ? (
              <Pill tone="rose">Not identified</Pill>
            ) : (
              "—"
            )
          }
        />
        <Field label="Source" value={`${SOURCE_LABEL[intake.source] || intake.source}${intake.source_status ? ` (${intake.source_status})` : ""}`} />
        <Field label="Customer PO" value={intake.customer_po_number || "—"} />
        <Field label="External order number" value={intake.external_order_number || "—"} />
        <Field label="Customer reference" value={intake.customer_reference || "—"} />
        <Field label="Order date" value={intake.order_date || "—"} />
        <Field label="Requested delivery" value={intake.requested_delivery_date || "—"} />
        <Field label="Currency" value={intake.currency || "—"} />
        {intake.notes ? <Field label="Notes" value={intake.notes} /> : null}
      </dl>
      {permissions.canEdit && customerIssue ? (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-3">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-rose-700">Choose the customer</div>
          {permissions.canRemember && intake.customer_reference ? (
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember “{intake.customer_reference}” as this customer for future {SOURCE_LABEL[intake.source] || intake.source} orders
            </label>
          ) : null}
          {candidates.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {candidates.map((c) => (
                <SecondaryButton key={c.id} disabled={busy} onClick={() => onResolveCustomer(c.id, remember)}>
                  {c.name || c.id}
                </SecondaryButton>
              ))}
            </div>
          ) : null}
          <Lookup type="customer" disabled={busy} onPick={(r) => onResolveCustomer(r.id, remember)} />
        </div>
      ) : null}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function LinesTable({
  lines,
  evaluations,
  issues,
  canSeeCost,
  canEdit,
  canRemember,
  busy,
  onResolve,
  onUpdate,
}: {
  lines: IntakeLineRow[];
  evaluations: LineEvaluation[];
  issues: PresentedIssue[];
  canSeeCost: boolean;
  canEdit: boolean;
  canRemember: boolean;
  busy: boolean;
  onResolve: (lineId: string, productId: string, remember: boolean) => void;
  onUpdate: (lineId: string, patch: { quantity?: number; unitPrice?: number | null }) => void;
}) {
  const byNo = useMemo(() => new Map(evaluations.map((e) => [e.lineNo, e])), [evaluations]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [remember, setRemember] = useState<Record<string, boolean>>({});

  return (
    <div className="grid gap-3">
      {lines.map((line) => {
        const evaluation = byNo.get(line.line_no);
        const lineIssues = issues.filter((i) => i.lineNo === line.line_no && i.severity !== "info");
        const tone = line.match_status === "MATCHED" ? "green" : line.match_status === "PENDING" ? "slate" : "rose";
        const unresolved = line.match_status === "UNMATCHED" || line.match_status === "AMBIGUOUS";
        return (
          <div key={line.id} className={`rounded-2xl border p-3 ${lineIssues.some((i) => i.severity === "error") ? "border-rose-200" : lineIssues.length ? "border-amber-200" : "border-slate-100"}`}>
            <div className="grid gap-3 md:grid-cols-[auto_1.4fr_1.4fr_1fr_1fr]">
              <div className="text-sm font-black text-slate-400">#{line.line_no}</div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">As received</div>
                <div className="truncate text-sm font-black text-slate-900">{line.raw_sku || "No SKU"}</div>
                <div className="truncate text-sm font-semibold text-slate-600">{line.raw_description || "—"}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">VYRON product</div>
                {evaluation?.productName ? (
                  <div className="truncate text-sm font-black text-slate-900">
                    {evaluation.productName}
                    {evaluation.sku ? <span className="ml-1 font-semibold text-slate-400">{evaluation.sku}</span> : null}
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-slate-400">—</div>
                )}
                <div className="mt-1">
                  <Pill tone={line.match_rule === "name_exact" ? "amber" : tone}>{line.match_status === "MATCHED" && line.match_rule ? RULE_LABEL[line.match_rule] || line.match_rule : humanise(line.match_status)}</Pill>
                </div>
              </div>
              <div className="text-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">Quantity / stock</div>
                <div className="font-black text-slate-900">
                  {qty(line.quantity)} {line.raw_unit || ""}
                </div>
                {evaluation && evaluation.available !== null ? (
                  <div className={`text-xs font-semibold ${evaluation.shortfall ? "text-amber-700" : "text-slate-500"}`}>
                    {qty(evaluation.available)} available{evaluation.shortfall ? ` · short ${qty(evaluation.shortfall)}` : ""}
                    {evaluation.shortfall && evaluation.hasBom ? " · can be produced" : ""}
                  </div>
                ) : null}
              </div>
              <div className="text-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">Price</div>
                <div className="font-black text-slate-900">{money(evaluation?.effectiveUnitPrice ?? line.unit_price)}</div>
                {evaluation?.expectedUnitPrice !== null && evaluation?.expectedUnitPrice !== undefined && evaluation.suppliedUnitPrice !== null && evaluation.suppliedUnitPrice !== evaluation.expectedUnitPrice ? (
                  <div className="text-xs font-semibold text-amber-700">
                    {evaluation.priceSource?.replace("_", " ")} {money(evaluation.expectedUnitPrice)}
                  </div>
                ) : evaluation?.priceSource && evaluation.suppliedUnitPrice === null ? (
                  <div className="text-xs font-semibold text-slate-500">from {evaluation.priceSource.replace("_", " ")}</div>
                ) : null}
                {line.discount_amount ? <div className="text-xs font-semibold text-slate-500">discount {money(line.discount_amount)}</div> : null}
                {canSeeCost && evaluation ? <div className="text-xs font-semibold text-slate-500">GP {evaluation.lineGp === null ? "not measured" : money(evaluation.lineGp)}</div> : null}
              </div>
            </div>

            {lineIssues.length ? (
              <ul className="mt-2 grid gap-1">
                {lineIssues.map((issue, index) => (
                  <li key={index} className={`text-xs font-semibold ${issue.severity === "error" ? "text-rose-700" : "text-amber-800"}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {canEdit ? (
              <div className="mt-3 grid gap-2">
                {unresolved && canRemember ? (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input type="checkbox" checked={Boolean(remember[line.id])} onChange={(e) => setRemember({ ...remember, [line.id]: e.target.checked })} />
                    Remember this {line.raw_sku ? `code “${line.raw_sku}”` : "description"} for this customer
                  </label>
                ) : null}
                {line.match_status === "AMBIGUOUS" && line.match_candidates?.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Choose:</span>
                    {line.match_candidates.map((c) => (
                      <SecondaryButton key={c.productId} disabled={busy} onClick={() => onResolve(line.id, c.productId, Boolean(remember[line.id]))}>
                        {c.productName}
                        {c.sku ? ` · ${c.sku}` : ""}
                      </SecondaryButton>
                    ))}
                  </div>
                ) : null}
                {unresolved ? <Lookup type="product" disabled={busy} onPick={(r) => onResolve(line.id, r.id, Boolean(remember[line.id]))} /> : null}
                {editing === line.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Quantity
                      <input value={draftQty} onChange={(e) => setDraftQty(e.target.value)} inputMode="decimal" className="mt-1 block w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Unit price (ex tax)
                      <input value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} inputMode="decimal" placeholder="Blank = VYRON price" className="mt-1 block w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                    </label>
                    <SecondaryButton
                      disabled={busy || !Number.isFinite(Number(draftQty))}
                      onClick={() => {
                        onUpdate(line.id, { quantity: Number(draftQty), unitPrice: draftPrice.trim() === "" ? null : Number(draftPrice) });
                        setEditing(null);
                      }}
                    >
                      Save
                    </SecondaryButton>
                    <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="justify-self-start text-xs font-black text-blue-700"
                    onClick={() => {
                      setEditing(line.id);
                      setDraftQty(String(line.quantity));
                      setDraftPrice(line.unit_price === null ? "" : String(line.unit_price));
                    }}
                  >
                    Correct quantity or price
                  </button>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A person's search, to resolve an exception. Never used for automatic matching. */
function Lookup({ type, disabled, onPick }: { type: "product" | "customer"; disabled: boolean; onPick: (result: LookupResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/order-intake/lookup?type=${type}&q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setResults(data.ok ? data.results : []);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder={type === "product" ? "Search products by name or SKU" : "Search customers"}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
        />
        <SecondaryButton disabled={disabled || searching || q.trim().length < 2} onClick={() => void search()}>
          Search
        </SecondaryButton>
      </div>
      {results.length ? (
        <div className="flex flex-wrap gap-2">
          {results.map((r) => (
            <SecondaryButton key={r.id} disabled={disabled} onClick={() => onPick(r)}>
              {r.product_name || r.customer_name}
              {r.sku ? ` · ${r.sku}` : ""}
            </SecondaryButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
