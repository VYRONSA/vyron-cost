import { createHash } from "crypto";
import type { OrderCandidate } from "@/lib/order-engine/types";

/**
 * Normalisation used by deterministic matching. Deliberately minimal: anything
 * more aggressive (stripping hyphens, zero-padding, removing words) turns an
 * exact match into a guess.
 */

/** SKU: surrounding whitespace removed, case-folded. Internal characters are kept exactly. */
export function normalizeSku(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

/** Names: trimmed, case-folded, internal whitespace runs collapsed to one space. */
export function normalizeName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** E-mail addresses compare case-insensitively after trimming. */
export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Escape LIKE/ILIKE metacharacters so a value is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * An ILIKE pattern for "equal after normalizeName": the words in order,
 * separated by `%` so any run of whitespace between them is found, anchored at
 * both ends (no leading or trailing wildcard). It returns a small superset —
 * names that start with the first word and end with the last — which the
 * caller MUST re-filter with normalizeName equality. It never widens a match.
 */
export function nameEqualityPattern(value: string): string {
  return normalizeName(value)
    .split(" ")
    .filter(Boolean)
    .map(escapeLike)
    .join("%");
}

/** A trimmed string, or null when empty. */
export function cleanText(value: unknown, maxLength = 500): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

/** A finite number, or null. Accepts "1,234.50" and "R 12.00" style strings. */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replace(/[\s,]/g, "").replace(/^[A-Za-z$€£]+/, "");
  if (!text || !/^-?\d*\.?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** ISO date (YYYY-MM-DD) or null. Only unambiguous ISO input is accepted — no locale guessing. */
export function toIsoDateOrNull(value: unknown): string | null {
  const text = cleanText(value, 40);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** SHA-256 over canonical JSON (sorted keys), so equal content always hashes equally. */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The content identity of a candidate: what the source said, not how VYRON matched it. */
export function candidateContentHash(candidate: OrderCandidate): string {
  return stableHash({
    source: candidate.source,
    sourceKey: candidate.sourceKey ?? null,
    externalOrderNumber: candidate.externalOrderNumber ?? null,
    customerPoNumber: candidate.customerPoNumber ?? null,
    customerId: candidate.customerId ?? null,
    customerName: candidate.customerName ?? null,
    customerReference: candidate.customerReference ?? null,
    orderDate: candidate.orderDate ?? null,
    requestedDeliveryDate: candidate.requestedDeliveryDate ?? null,
    currency: candidate.currency ?? null,
    supplied: candidate.supplied ?? null,
    // Added later: included only when present, so earlier orders keep their hash.
    ...(candidate.externalCustomerId ? { externalCustomerId: candidate.externalCustomerId } : {}),
    ...(candidate.context ? { context: candidate.context } : {}),
    lines: candidate.lines.map((line) => ({
      ref: line.sourceLineReference ?? null,
      sku: line.sku ?? null,
      description: line.description ?? null,
      unit: line.unit ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? null,
      discountAmount: line.discountAmount ?? null,
      taxAmount: line.taxAmount ?? null,
      lineTotal: line.lineTotal ?? null,
      productId: line.productId ?? null,
      ...(line.externalProductId ? { externalProductId: line.externalProductId } : {}),
    })),
  });
}
