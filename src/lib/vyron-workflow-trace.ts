/**
 * VYRON — supplier invoice workflow trace.
 *
 * One block per stage boundary, identical on the server and in the browser, so
 * a single invoice can be followed from upload to approval across both consoles
 * without correlating two log shapes.
 *
 *   [VYRON] EXTRACTION START
 *   doc=a1b2c3d4
 *   start=2026-08-03T06:12:04.118Z
 *   engine=v2
 *
 *   [VYRON] EXTRACTION COMPLETE
 *   doc=a1b2c3d4
 *   start=2026-08-03T06:12:04.118Z
 *   end=2026-08-03T06:12:26.205Z
 *   elapsed=22087ms
 *   status=success
 *   rows=16
 *
 * Deliberately not behind a debug flag. This is a live production incident and
 * the trace has to be present in the environment the operator is using, not one
 * an engineer has to reproduce first.
 */

type StageTimer = { startedAt: number; startedIso: string };

const timers = new Map<string, StageTimer>();

/**
 * When the workflow for a document began, per runtime.
 *
 * `elapsed` is what the operator actually experiences — the wait from starting
 * the invoice to the stage now finishing — so it is measured from this anchor
 * rather than from each stage's own start.
 *
 * The anchor is per runtime by necessity: the server and the browser are
 * separate processes with no shared clock origin. Each sets its own anchor on
 * the first stage it sees for a document, and every line records which stage
 * that was, so the two timelines can be read without assuming they share a
 * zero. Server elapsed is measured from UPLOAD; browser elapsed from the first
 * UI action on that document.
 */
const anchors = new Map<string, { at: number; stage: string }>();

/** Establish or read the elapsed-time origin for a document. */
function anchorFor(stage: string, documentId: string | null | undefined) {
  const id = shortId(documentId);
  if (id === "pending") return null;
  const existing = anchors.get(id);
  if (existing) return existing;
  const created = { at: Date.now(), stage };
  anchors.set(id, created);
  return created;
}

/** Forget a document's origin. Called when the workflow reaches a terminal stage. */
export function traceReset(documentId: string | null | undefined) {
  anchors.delete(shortId(documentId));
}

/** Short, stable identifier — greppable without being a wall of uuid. */
function shortId(documentId: string | null | undefined) {
  if (!documentId) return "pending";
  return String(documentId).slice(0, 8);
}

function key(stage: string, documentId: string | null | undefined) {
  return `${shortId(documentId)}:${stage}`;
}

function detailLines(detail?: Record<string, unknown>) {
  if (!detail) return [] as string[];
  const lines: string[] = [];
  for (const [name, value] of Object.entries(detail)) {
    if (value === undefined || value === null) continue;
    lines.push(`${name}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  }
  return lines;
}

function emit(header: string, lines: string[]) {
  console.log([`[VYRON] ${header}`, ...lines].join("\n  "));
}

export function traceStart(stage: string, documentId?: string | null, detail?: Record<string, unknown>) {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  timers.set(key(stage, documentId), { startedAt, startedIso });
  const anchor = anchorFor(stage, documentId);
  emit(`${stage} START`, [
    `doc=${shortId(documentId)}`,
    `start=${startedIso}`,
    ...(anchor ? [`elapsed=${startedAt - anchor.at}ms`] : []),
    ...detailLines(detail),
  ]);
  return startedAt;
}

function finish(
  stage: string,
  documentId: string | null | undefined,
  status: "success" | "failed",
  detail?: Record<string, unknown>
) {
  const id = key(stage, documentId);
  const timer = timers.get(id);
  timers.delete(id);
  const endedAt = Date.now();

  const anchor = anchorFor(stage, documentId);

  const lines = [`doc=${shortId(documentId)}`];
  if (timer) lines.push(`start=${timer.startedIso}`);
  lines.push(`end=${new Date(endedAt).toISOString()}`);
  // `stage` is this step's own duration and is only printed when a matching
  // START was seen — a completion without one gets no duration rather than a
  // fabricated zero. `elapsed` is the operator-visible wait since the anchor.
  if (timer) lines.push(`stage=${endedAt - timer.startedAt}ms`);
  if (anchor) lines.push(`elapsed=${endedAt - anchor.at}ms`);
  lines.push(`status=${status === "success" ? "SUCCESS" : "FAILURE"}`);
  lines.push(...detailLines(detail));

  emit(`${stage} ${status === "success" ? "COMPLETE" : "FAILED"}`, lines);
}

export function traceComplete(stage: string, documentId?: string | null, detail?: Record<string, unknown>) {
  finish(stage, documentId, "success", detail);
}

/** A stage that ended badly. `reason` is required so a failure is never bare. */
export function traceFailed(
  stage: string,
  documentId?: string | null,
  detail?: Record<string, unknown> & { reason?: string }
) {
  finish(stage, documentId, "failed", detail);
}

/** A point event with no duration — a poll tick, a refresh, a state change. */
export function traceEvent(stage: string, documentId?: string | null, detail?: Record<string, unknown>) {
  const anchor = anchorFor(stage, documentId);
  emit(`${stage} EVENT`, [
    `doc=${shortId(documentId)}`,
    `at=${new Date().toISOString()}`,
    ...(anchor ? [`elapsed=${Date.now() - anchor.at}ms`] : []),
    ...detailLines(detail),
  ]);
}

/**
 * Row count at one point in the line-item pipeline.
 *
 * Printed with a fixed `ROWS` header so every count in a run can be read in one
 * grep and compared: OpenAI JSON -> normalised -> database -> review draft ->
 * React grid. A row that disappears is then located by the first count that
 * drops, without inference.
 */
export function traceRows(point: string, documentId: string | null | undefined, count: number, detail?: Record<string, unknown>) {
  const anchor = anchorFor(`ROWS ${point}`, documentId);
  emit("ROWS", [
    `doc=${shortId(documentId)}`,
    `at=${new Date().toISOString()}`,
    ...(anchor ? [`elapsed=${Date.now() - anchor.at}ms`] : []),
    `point=${point}`,
    `count=${count}`,
    ...detailLines(detail),
  ]);
}

/** Wrap an async stage so the completion line cannot be forgotten on a throw. */
export async function traced<T>(
  stage: string,
  documentId: string | null | undefined,
  run: () => Promise<T>,
  detail?: (result: T) => Record<string, unknown>
): Promise<T> {
  traceStart(stage, documentId);
  try {
    const result = await run();
    traceComplete(stage, documentId, detail ? detail(result) : undefined);
    return result;
  } catch (error) {
    traceFailed(stage, documentId, { reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
