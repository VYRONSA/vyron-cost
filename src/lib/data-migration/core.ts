/**
 * Controlled data migration — the rules every import stage obeys.
 *
 * Pure functions, no I/O. A stage turns source records into a PLAN: one item
 * per source record saying what would happen to it (create / match / update /
 * skip / exception) and why. Nothing here writes to a database; the executor
 * applies an approved plan, and only a plan.
 *
 * Non-negotiable properties, enforced here rather than left to each stage:
 *
 *  - Identity is decided by a fixed ladder of EXACT rules. There is no fuzzy
 *    matching anywhere in this module. Two candidates at the same rung is an
 *    exception, never a choice.
 *  - "TBC" is a value, not a blank and never zero.
 *  - A blank source value never overwrites a target value.
 *  - Output is deterministic: the same sources produce the same plan, byte for
 *    byte, so a dry run can be diffed against a later one.
 */
import { createHash } from "node:crypto";

/* ------------------------------------------------------------- provenance */

export type SourceRef = {
  /** e.g. "inflow", "xero", "gs1", "workbook". */
  system: string;
  file: string;
  fileSha256: string;
  sheet?: string;
  /** 1-based row in the source, header row included. */
  row: number;
};

/* -------------------------------------------------------------- the plan */

export type PlanAction = "create" | "match" | "update" | "skip" | "exception";

/** The rung of the identity ladder that produced a match. */
export type MatchRule = "source_link" | "exact_sku" | "normalized_sku" | "normalized_name" | "approved_alias";

export type IssueSeverity =
  /** Blocks the record. It is not written. */
  | "exception"
  /** Written, but a value is knowingly unresolved (e.g. TBC cost) and must be resolved. */
  | "unresolved"
  /** Written; worth a human look. */
  | "warning";

export type Issue = { code: string; severity: IssueSeverity; field?: string; message: string };

export type FieldChange = { field: string; from: unknown; to: unknown };

export type PlanItem<T = Record<string, unknown>> = {
  stage: string;
  /** Deterministic identity of the source record within its stage. */
  sourceKey: string;
  sources: SourceRef[];
  action: PlanAction;
  matchRule?: MatchRule;
  targetId?: string;
  /** What would be written (create) or the merged record (update). */
  proposed?: T;
  changes?: FieldChange[];
  issues: Issue[];
  /** Stage-specific classification, e.g. "raw_material", "pseudo_vendor". */
  classification?: string;
};

export type StageCounts = Record<PlanAction, number> & { total: number; unresolved: number; warnings: number };

export function countPlan(items: PlanItem[]): StageCounts {
  const counts: StageCounts = { create: 0, match: 0, update: 0, skip: 0, exception: 0, total: 0, unresolved: 0, warnings: 0 };
  for (const item of items) {
    counts[item.action] += 1;
    counts.total += 1;
    if (item.issues.some((issue) => issue.severity === "unresolved")) counts.unresolved += 1;
    if (item.issues.some((issue) => issue.severity === "warning")) counts.warnings += 1;
  }
  return counts;
}

/**
 * Stable order: by stage, then source key, then first source row — so two
 * records sharing a key (e.g. duplicates, both exceptions) never swap places
 * when the input rows arrive in a different order. Plans are compared by hash.
 */
export function sortPlan<T extends PlanItem>(items: T[]): T[] {
  const firstRow = (item: PlanItem) => (item.sources.length ? Math.min(...item.sources.map((source) => source.row)) : 0);
  return [...items].sort((a, b) =>
    a.stage !== b.stage ? compareText(a.stage, b.stage) : a.sourceKey !== b.sourceKey ? compareText(a.sourceKey, b.sourceKey) : firstRow(a) - firstRow(b)
  );
}

/* ---------------------------------------------------------- normalisation */

function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Text as a person reads it: Unicode-normalised, typographic dashes and quotes
 * made plain, whitespace collapsed, case folded. Nothing is removed — "Half",
 * "Copy", "(GO)" and "SQ" all survive, because they change identity.
 */
export function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/�/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A SKU with only presentation removed: trimmed, upper-cased, inner spaces removed. */
export function normalizeSku(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

export function isTbc(value: unknown): boolean {
  return /\bTBC\b/i.test(String(value ?? ""));
}

/* ------------------------------------------------------------------ values */

export type SourceNumber =
  | { kind: "number"; value: number; raw: string }
  | { kind: "tbc"; raw: string }
  | { kind: "blank" }
  | { kind: "invalid"; raw: string };

/**
 * A numeric source cell, classified rather than coerced. "TBC" stays TBC; a
 * blank stays blank; "–" and other non-numbers are reported as invalid. The
 * caller decides what each kind means — this function never turns any of them
 * into zero.
 */
export function parseSourceNumber(value: unknown): SourceNumber {
  if (typeof value === "number") return Number.isFinite(value) ? { kind: "number", value, raw: String(value) } : { kind: "invalid", raw: String(value) };
  const raw = String(value ?? "").trim();
  if (!raw) return { kind: "blank" };
  if (isTbc(raw)) return { kind: "tbc", raw };
  const cleaned = raw.replace(/^R\s*/i, "").replace(/,/g, "");
  if (/^[-+]?(\d+(\.\d+)?|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return { kind: "number", value: Number(cleaned), raw };
  return { kind: "invalid", raw };
}

/**
 * Multiply a plain decimal string by 10^exponent exactly — a shift of the
 * decimal point, no floating point involved. "0.09391" × 10^3 is "93.91";
 * "4.7" × 10^-3 is "0.0047". Throws on anything that is not a plain decimal.
 */
export function scaleDecimal(raw: string, exponent: number): string {
  const match = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(raw.trim());
  if (!match || (!match[2] && !match[3])) throw new Error(`Not a plain decimal: "${raw}"`);
  const negative = match[1] === "-";
  let digits = `${match[2] || ""}${match[3] || ""}`;
  let point = (match[2] || "").length + exponent;
  if (point < 0) {
    digits = `${"0".repeat(-point)}${digits}`;
    point = 0;
  }
  if (point > digits.length) digits = `${digits}${"0".repeat(point - digits.length)}`;
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  const fraction = digits.slice(point).replace(/0+$/, "");
  const result = fraction ? `${whole}.${fraction}` : whole;
  return negative && result !== "0" ? `-${result}` : result;
}

/* Exact decimal arithmetic on plain decimal strings, for expected results that
   must not inherit binary floating-point error. */

function placesOf(raw: string): number {
  const text = raw.trim();
  const point = text.indexOf(".");
  return point < 0 ? 0 : text.length - point - 1;
}

function toScaled(raw: string, scale: number): bigint {
  const match = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(raw.trim());
  if (!match || (!match[2] && !match[3])) throw new Error(`Not a plain decimal: "${raw}"`);
  const fraction = (match[3] || "").padEnd(scale, "0");
  const value = BigInt(`${match[2] || "0"}${fraction}`);
  return match[1] === "-" ? -value : value;
}

function fromScaled(value: bigint, scale: number): string {
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale) || "0";
  const fraction = scale ? digits.slice(digits.length - scale).replace(/0+$/, "") : "";
  const result = fraction ? `${whole}.${fraction}` : whole;
  return negative && result !== "0" ? `-${result}` : result;
}

export function addDecimal(a: string, b: string): string {
  const scale = Math.max(placesOf(a), placesOf(b));
  return fromScaled(toScaled(a, scale) + toScaled(b, scale), scale);
}

export function subtractDecimal(a: string, b: string): string {
  const scale = Math.max(placesOf(a), placesOf(b));
  return fromScaled(toScaled(a, scale) - toScaled(b, scale), scale);
}

export function multiplyDecimal(a: string, b: string): string {
  const scaleA = placesOf(a);
  const scaleB = placesOf(b);
  return fromScaled(toScaled(a, scaleA) * toScaled(b, scaleB), scaleA + scaleB);
}

/** Round half away from zero — how PostgreSQL rounds a numeric into a narrower column. */
export function roundDecimal(raw: string, places: number): string {
  const scale = placesOf(raw);
  if (scale <= places) return fromScaled(toScaled(raw, scale), scale);
  const value = toScaled(raw, scale);
  const factor = BigInt(10) ** BigInt(scale - places);
  const negative = value < BigInt(0);
  const magnitude = negative ? -value : value;
  let quotient = magnitude / factor;
  if ((magnitude % factor) * BigInt(2) >= factor) quotient += BigInt(1);
  return fromScaled(negative ? -quotient : quotient, places);
}

/** Significant decimal places of a plain decimal string ("13.96420" → 4). */
export function decimalPlaces(raw: string): number {
  const text = raw.trim();
  const point = text.indexOf(".");
  return point < 0 ? 0 : text.slice(point + 1).replace(/0+$/, "").length;
}

/** "True"/"False" as exported by inFlow; anything else is unknown, not false. */
export function parseSourceBoolean(value: unknown): boolean | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "yes") return true;
  if (raw === "false" || raw === "no") return false;
  return null;
}

/* ---------------------------------------------------------------- matching */

export type MatchCandidate = { id: string; sku?: string | null; name?: string | null };

export type MatchInput = {
  sourceKey: string;
  sku?: string | null;
  name?: string | null;
};

export type MatchContext = {
  /** sourceKey -> target id, from previously recorded source links. */
  sourceLinks?: Map<string, string>;
  /** normalized source name -> target id, only for aliases a person approved. */
  approvedAliases?: Map<string, string>;
};

export type MatchResult =
  | { status: "matched"; rule: MatchRule; targetId: string }
  | { status: "none" }
  | { status: "ambiguous"; rule: MatchRule; targetIds: string[] };

/**
 * The identity ladder. Each rung is exact; the first rung that finds anything
 * decides. One hit is a match. More than one is ambiguous and must become an
 * exception — this function never chooses between candidates.
 */
export function matchEntity(input: MatchInput, candidates: MatchCandidate[], context: MatchContext = {}): MatchResult {
  const linked = context.sourceLinks?.get(input.sourceKey);
  if (linked) return { status: "matched", rule: "source_link", targetId: linked };

  const decide = (rule: MatchRule, hits: MatchCandidate[]): MatchResult | null => {
    const ids = [...new Set(hits.map((hit) => hit.id))].sort();
    if (ids.length === 1) return { status: "matched", rule, targetId: ids[0] };
    if (ids.length > 1) return { status: "ambiguous", rule, targetIds: ids };
    return null;
  };

  const sku = String(input.sku ?? "").trim();
  if (sku) {
    const exact = decide("exact_sku", candidates.filter((c) => c.sku && String(c.sku).trim() === sku));
    if (exact) return exact;
    const normalized = decide("normalized_sku", candidates.filter((c) => c.sku && normalizeSku(c.sku) === normalizeSku(sku)));
    if (normalized) return normalized;
  }

  const name = normalizeName(input.name);
  if (name) {
    const byName = decide("normalized_name", candidates.filter((c) => normalizeName(c.name) === name));
    if (byName) return byName;
    const alias = context.approvedAliases?.get(name);
    if (alias) return { status: "matched", rule: "approved_alias", targetId: alias };
  }

  return { status: "none" };
}

/* ----------------------------------------------------------- field merging */

/**
 * Fields an update would change. A blank source value never replaces a target
 * value, and a TBC source value never replaces a known number.
 */
export function diffFields(target: Record<string, unknown>, source: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of Object.keys(source).sort()) {
    const next = source[field];
    if (isBlank(next)) continue;
    const current = target[field];
    if (isTbc(next) && !isBlank(current) && !isTbc(current)) continue;
    if (String(current ?? "") !== String(next)) changes.push({ field, from: current ?? null, to: next });
  }
  return changes;
}

/* ------------------------------------------------------------------ hashing */

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function sha256OfBuffer(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}
