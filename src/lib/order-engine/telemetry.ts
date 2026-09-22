/**
 * Order Engine observability: one structured line per business event, for log
 * search and simple counting (received, validated, exceptions, awaiting
 * approval, approved, rejected, handoff success / failure).
 *
 * Only allow-listed fields are ever written: identifiers, statuses, counts,
 * codes and timings. Customer names, e-mail addresses, prices, order lines,
 * free-text reasons and message bodies are never logged, whatever a caller
 * passes.
 */

export type OrderEngineMetric =
  | "order.received"
  | "order.duplicate"
  | "order.validated"
  | "order.exception"
  | "order.awaiting_approval"
  | "order.approved"
  | "order.rejected"
  | "order.held"
  | "order.cancelled"
  | "order.handoff_succeeded"
  | "order.handoff_failed"
  | "order.approval_refused"
  | "email.received";

const ALLOWED_FIELDS = new Set([
  "companyId",
  "intakeId",
  "intakeNumber",
  "source",
  "status",
  "fromStatus",
  "toStatus",
  "lines",
  "errors",
  "warnings",
  "codes",
  "durationMs",
  "salesOrderId",
  "reason",
  "messageStatus",
]);

type Sink = (line: string) => void;

let sink: Sink | null = null;

/** Tests (and any future log shipper) can capture lines; by default they go to stdout when enabled. */
export function setOrderEngineLogSink(next: Sink | null): void {
  sink = next;
}

function enabled(): boolean {
  return sink !== null || process.env.VYRON_ORDER_ENGINE_LOG === "on";
}

/** `reason` must be a machine code (e.g. "CONFLICT"), never free text — it is truncated to be safe. */
export function recordOrderEngineEvent(metric: OrderEngineMetric, fields: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key) || value === undefined) continue;
    if (key === "reason") safe[key] = String(value).replace(/[^A-Z0-9_]/gi, "").slice(0, 60);
    else if (key === "codes" && Array.isArray(value)) safe[key] = value.map((c) => String(c).replace(/[^A-Z0-9_]/gi, "")).slice(0, 50);
    else safe[key] = value;
  }
  const line = JSON.stringify({ scope: "order-engine", metric, at: new Date().toISOString(), ...safe });
  if (sink) sink(line);
  else console.info(line);
}
