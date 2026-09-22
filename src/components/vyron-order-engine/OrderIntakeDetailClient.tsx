"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleSlash, PauseCircle, RefreshCw, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { STATUS_LABEL, type IntakeAction } from "@/lib/order-engine/lifecycle";
import type {
  IntakeEventRow,
  IntakeLineRow,
  IntakeRow,
  LineEvaluation,
  ValidationIssue,
  ValidationSnapshot,
} from "@/lib/order-engine/types";
import { Card, IntakeStatusPill, Notice, NotEnabledNotice, Pill, PrimaryButton, SecondaryButton, SeverityPill, money, qty, when } from "@/components/vyron-order-engine/ui";

type Detail = {
  intake: IntakeRow;
  lines: IntakeLineRow[];
  events: IntakeEventRow[];
  salesOrder: { id: string; order_number: string; status: string; total: number | null } | null;
  derived: { approvalStatus: string; fulfilmentStatus: string; invoiceStatus: string };
  permissions: { canSeeCost: boolean; canEdit: boolean; actions: IntakeAction[] };
};

type LookupResult = { id: string; product_name?: string; customer_name?: string; sku?: string | null };

const RULE_LABEL: Record<string, string> = {
  manual: "Chosen by a person",
  sku_exact: "Exact SKU",
  sku_normalized: "SKU (case/spaces)",
  alias: "Approved alias",
  name_exact: "Exact name — review",
  customer_id: "Chosen by a person",
  sender_email: "Sender e-mail — review",
};

const humanise = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

type LoadResult = { kind: "ok"; detail: Detail } | { kind: "not_enabled" } | { kind: "error"; error: string };

/** Pure fetch: returns the result, sets no state. */
async function fetchIntakeDetail(id: string): Promise<LoadResult> {
  const res = await fetch(`/api/order-intake/${id}`, { cache: "no-store" }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (res?.status === 503 && data.code === "NOT_ENABLED") return { kind: "not_enabled" };
  if (!res || !res.ok || !data.ok) return { kind: "error", error: data.error || "Could not load the order." };
  return { kind: "ok", detail: data as Detail };
}

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
  const snapshot = (intake.validation && "issues" in intake.validation ? intake.validation : null) as ValidationSnapshot | null;
  const issues = snapshot?.issues || [];
  const warnings = issues.filter((i) => i.severity === "warning");
  const can = (action: IntakeAction) => permissions.actions.includes(action);

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <Link href="/order-inbox" className="text-sm font-black text-blue-700">
          ← Order Inbox
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-slate-900">{intake.intake_number}</h1>
          <IntakeStatusPill status={intake.status} />
          <Pill>{intake.source}</Pill>
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
          <OrderHeader detail={detail} busy={busy} onResolveCustomer={(customerId) => send("PATCH", { customerId }, "Customer set. Validate the order again.")} />

          <Card title={`Lines (${lines.length})`}>
            <LinesTable
              lines={lines}
              evaluations={snapshot?.lines || []}
              issues={issues}
              canSeeCost={permissions.canSeeCost}
              canEdit={permissions.canEdit}
              busy={busy}
              onResolve={(lineId, productId) => send("PATCH", { resolveLines: [{ lineId, productId }] }, "Product chosen. Validate the order again.")}
              onUpdate={(lineId, patch) => send("PATCH", { updateLines: [{ lineId, ...patch }] }, "Line updated. Validate the order again.")}
            />
          </Card>

          <Card title="Audit trail">
            <ol className="grid gap-3">
              {events.map((event) => (
                <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500" />
                  <div>
                    <div className="font-black text-slate-800">
                      {humanise(event.event_type)}
                      {event.from_status || event.to_status ? (
                        <span className="ml-2 text-xs font-semibold text-slate-400">
                          {event.from_status || "—"} → {event.to_status || "—"}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {when(event.created_at)} · {event.actor_name || event.actor}
                    </div>
                    {event.detail ? <div className="mt-0.5 text-sm font-semibold text-slate-600">{event.detail}</div> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Card title="Validation">
            {!snapshot ? (
              <p className="text-sm font-semibold text-slate-500">Not validated yet{intake.decision_note && intake.status === "RECEIVED" ? ` — changes requested: ${intake.decision_note}` : ""}.</p>
            ) : issues.length === 0 ? (
              <Notice tone="success">No issues. Validated {when(snapshot.validatedAt)}.</Notice>
            ) : (
              <div className="grid gap-2">
                {(["error", "warning", "info"] as const).flatMap((severity) =>
                  issues
                    .filter((issue) => issue.severity === severity)
                    .map((issue, index) => (
                      <div key={`${severity}-${index}`} className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-xl border border-slate-100 p-2.5 text-sm">
                        <SeverityPill severity={issue.severity} />
                        <div className="font-semibold text-slate-700">
                          {issue.lineNo ? <span className="mr-1 font-black text-slate-900">Line {issue.lineNo}:</span> : null}
                          {issue.message}
                        </div>
                      </div>
                    ))
                )}
                <div className="text-xs font-semibold text-slate-400">Validated {when(snapshot.validatedAt)}</div>
              </div>
            )}
          </Card>

          {snapshot ? (
            <Card title="Expected value">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="font-semibold text-slate-500">Subtotal (ex tax)</dt>
                <dd className="text-right font-black text-slate-900">{money(snapshot.totals.expectedSubtotal)}</dd>
                {permissions.canSeeCost ? (
                  <>
                    <dt className="font-semibold text-slate-500">Expected cost</dt>
                    <dd className="text-right font-black text-slate-900">{money(snapshot.totals.expectedCost)}</dd>
                    <dt className="font-semibold text-slate-500">Expected gross profit</dt>
                    <dd className="text-right font-black text-slate-900">{money(snapshot.totals.expectedGp)}</dd>
                    <dt className="font-semibold text-slate-500">Expected margin</dt>
                    <dd className="text-right font-black text-slate-900">{snapshot.totals.expectedGpPct === null ? "Not measured" : `${snapshot.totals.expectedGpPct}%`}</dd>
                  </>
                ) : null}
              </dl>
              {permissions.canSeeCost && snapshot.totals.marginNotMeasuredLines > 0 ? (
                <p className="mt-3 text-xs font-semibold text-slate-500">Margin not measured on {snapshot.totals.marginNotMeasuredLines} line(s): no product cost in VYRON.</p>
              ) : null}
              <p className="mt-3 text-xs font-semibold text-slate-400">Cost is the current product cost. Tax is applied by Sales Orders at the workspace rate.</p>
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
                      void act("approve", "Approved — a Draft sales order was created.", {
                        validationHash: intake.validation_hash,
                        acknowledgeWarnings: acknowledge,
                        reason: reason || null,
                      })
                    }
                  >
                    <Check size={16} /> Approve and create sales order
                  </PrimaryButton>
                  <p className="text-xs font-semibold text-slate-500">
                    Creates a Draft in Sales Orders. Nothing is reserved, invoiced, e-mailed or sent to Xero.
                  </p>
                </div>
              ) : null}

              {can("confirm") ? (
                <PrimaryButton disabled={busy} onClick={() => void act("confirm", "Sales order created.")}>
                  <RefreshCw size={16} /> Retry creating the sales order
                </PrimaryButton>
              ) : null}

              {(["hold", "request_changes", "reject", "cancel"] as IntakeAction[]).some(can) ? (
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                    Reason / note
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
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

          <Card title="Downstream">
            {salesOrder ? (
              <div className="grid gap-2 text-sm font-semibold text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Sales order</span>
                  <Link href="/customer-sales-orders" className="inline-flex items-center gap-1 font-black text-blue-700">
                    {salesOrder.order_number} <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="flex items-center justify-between">
                  <span>Sales-order status</span>
                  <Pill tone="blue">{salesOrder.status}</Pill>
                </div>
                <p className="text-xs text-slate-500">
                  Fulfilment and invoicing continue in Sales Orders and the Order Centre. Stock is reserved only when the sales order is approved there;
                  invoicing and Xero posting remain separate, deliberate steps.
                </p>
              </div>
            ) : intake.status === "APPROVED" ? (
              <Notice tone="warning">Approved, but the sales order has not been created yet. Retry above once the cause shown in the audit trail is fixed.</Notice>
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

function OrderHeader({ detail, busy, onResolveCustomer }: { detail: Detail; busy: boolean; onResolveCustomer: (customerId: string) => void }) {
  const { intake, permissions } = detail;
  const snapshot = (intake.validation && "issues" in intake.validation ? intake.validation : null) as ValidationSnapshot | null;
  const customerIssue = snapshot?.issues.find((i) => i.code === "CUSTOMER_NOT_FOUND" || i.code === "CUSTOMER_AMBIGUOUS");
  const candidates = (customerIssue?.data?.candidates as Array<{ id: string; name: string | null }> | undefined) || [];

  return (
    <Card title="Order">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Field label="Customer on the order" value={intake.customer_name || "Not stated"} />
        <Field
          label="Customer in VYRON"
          value={
            snapshot?.customer?.id ? (
              <span className="flex flex-wrap items-center gap-2">
                {snapshot.customer.name}
                {snapshot.customer.matchRule ? <Pill tone={snapshot.customer.matchRule === "sender_email" ? "amber" : "green"}>{RULE_LABEL[snapshot.customer.matchRule]}</Pill> : null}
              </span>
            ) : snapshot ? (
              <Pill tone="rose">Not identified</Pill>
            ) : (
              "—"
            )
          }
        />
        <Field label="Customer PO" value={intake.customer_po_number || "—"} />
        <Field label="External order number" value={intake.external_order_number || "—"} />
        <Field label="Requested delivery" value={intake.requested_delivery_date || "—"} />
        <Field label="Customer reference" value={intake.customer_reference || "—"} />
        {intake.notes ? <Field label="Notes" value={intake.notes} /> : null}
      </dl>
      {permissions.canEdit && customerIssue ? (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-3">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-rose-700">Choose the customer</div>
          {candidates.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {candidates.map((c) => (
                <SecondaryButton key={c.id} disabled={busy} onClick={() => onResolveCustomer(c.id)}>
                  {c.name || c.id}
                </SecondaryButton>
              ))}
            </div>
          ) : null}
          <Lookup type="customer" disabled={busy} onPick={(r) => onResolveCustomer(r.id)} />
        </div>
      ) : null}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
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
  busy,
  onResolve,
  onUpdate,
}: {
  lines: IntakeLineRow[];
  evaluations: LineEvaluation[];
  issues: ValidationIssue[];
  canSeeCost: boolean;
  canEdit: boolean;
  busy: boolean;
  onResolve: (lineId: string, productId: string) => void;
  onUpdate: (lineId: string, patch: { quantity?: number; unitPrice?: number | null }) => void;
}) {
  const byNo = useMemo(() => new Map(evaluations.map((e) => [e.lineNo, e])), [evaluations]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [draftPrice, setDraftPrice] = useState("");

  return (
    <div className="grid gap-3">
      {lines.map((line) => {
        const evaluation = byNo.get(line.line_no);
        const lineIssues = issues.filter((i) => i.lineNo === line.line_no && i.severity !== "info");
        const tone = line.match_status === "MATCHED" ? "green" : line.match_status === "PENDING" ? "slate" : "rose";
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
                  <Pill tone={line.match_rule === "name_exact" ? "amber" : tone}>{line.match_status === "MATCHED" && line.match_rule ? RULE_LABEL[line.match_rule] : humanise(line.match_status)}</Pill>
                </div>
              </div>
              <div className="text-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">Quantity / stock</div>
                <div className="font-black text-slate-900">{qty(line.quantity)}</div>
                {evaluation && evaluation.available !== null ? (
                  <div className={`text-xs font-semibold ${evaluation.shortfall ? "text-amber-700" : "text-slate-500"}`}>
                    {qty(evaluation.available)} available{evaluation.shortfall ? ` · short ${qty(evaluation.shortfall)}` : ""}
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
                {canSeeCost && evaluation ? (
                  <div className="text-xs font-semibold text-slate-500">GP {evaluation.lineGp === null ? "not measured" : money(evaluation.lineGp)}</div>
                ) : null}
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
                {line.match_status === "AMBIGUOUS" && line.match_candidates?.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Choose:</span>
                    {line.match_candidates.map((c) => (
                      <SecondaryButton key={c.productId} disabled={busy} onClick={() => onResolve(line.id, c.productId)}>
                        {c.productName}
                        {c.sku ? ` · ${c.sku}` : ""}
                      </SecondaryButton>
                    ))}
                  </div>
                ) : null}
                {line.match_status === "UNMATCHED" || line.match_status === "AMBIGUOUS" ? (
                  <Lookup type="product" disabled={busy} onPick={(r) => onResolve(line.id, r.id)} />
                ) : null}
                {editing === line.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Quantity
                      <input value={draftQty} onChange={(e) => setDraftQty(e.target.value)} inputMode="decimal" className="mt-1 block w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Unit price
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
