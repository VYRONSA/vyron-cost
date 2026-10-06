/**
 * Whether an approved supplier-invoice line may replace a master cost.
 *
 * A supplier prices per its own invoice unit (a case, a 25 kg bag, "50s"); a
 * VOLORA ingredient is costed per its purchase unit (kg, L, each). Writing the
 * invoice's unit price into the master cost without proving the two units are
 * the same turned a R58.70 pack of 50 paper plates into R58.70 per plate. So
 * the cost is replaced only when the units provably match and the change is
 * plausible; otherwise the price is still recorded in price history and the
 * update is held for a person, who knows the pack size.
 *
 * A finished product's cost comes from its own costing (BOM / cost lines),
 * never from a supplier line: a supplier line matched to a product is held.
 *
 * Pure. Nothing here reads or writes.
 */

export type SupplierCostDecision =
  | { apply: true }
  | { apply: false; code: "PRODUCT_COST_NOT_FROM_SUPPLIER" | "NO_PRICE" | "UNIT_UNVERIFIED" | "IMPLAUSIBLE_CHANGE"; reason: string };

/** A price at more than double, or under half, the current cost is not applied without a person. */
export const MAX_AUTOMATIC_COST_RATIO = 2;

const UNIT_SYNONYMS: Record<string, string> = {
  ea: "each",
  each: "each",
  unit: "each",
  units: "each",
  pc: "each",
  pcs: "each",
  piece: "each",
  pieces: "each",
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  l: "l",
  lt: "l",
  ltr: "l",
  litre: "l",
  liter: "l",
  litres: "l",
  liters: "l",
  ml: "ml",
};

/**
 * The costing unit a unit label names, or null when it is not a plain unit
 * (blank, or a pack size such as "5kg", "50s", "1000", "CASE" — unknown words
 * are compared literally by `sameCostUnit`, never mapped).
 */
export function normalizeCostUnit(unit: string | null | undefined): string | null {
  const key = String(unit ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!key) return null;
  return UNIT_SYNONYMS[key] ?? null;
}

/** True only when both labels name the same plain unit. A label with a digit is a pack size and never matches. */
export function sameCostUnit(invoiceUnit: string | null | undefined, masterUnit: string | null | undefined): boolean {
  const a = String(invoiceUnit ?? "").trim().toLowerCase();
  const b = String(masterUnit ?? "").trim().toLowerCase();
  if (!a || !b || /\d/.test(a) || /\d/.test(b)) return false;
  const na = normalizeCostUnit(a);
  const nb = normalizeCostUnit(b);
  if (na || nb) return na === nb;
  return a === b;
}

export function decideSupplierCostUpdate(input: {
  entityType: string | null | undefined;
  invoiceUnit: string | null | undefined;
  masterUnit: string | null | undefined;
  previousCost: number;
  newCost: number;
}): SupplierCostDecision {
  if (input.entityType === "product") {
    return {
      apply: false,
      code: "PRODUCT_COST_NOT_FROM_SUPPLIER",
      reason: "A finished product's cost comes from its costing, not from a supplier invoice line. Price recorded; product cost unchanged.",
    };
  }
  const next = Number(input.newCost);
  if (!Number.isFinite(next) || next <= 0) {
    return { apply: false, code: "NO_PRICE", reason: "The invoice line has no positive unit price. Cost unchanged." };
  }
  if (!sameCostUnit(input.invoiceUnit, input.masterUnit)) {
    return {
      apply: false,
      code: "UNIT_UNVERIFIED",
      reason: `The invoice prices per "${String(input.invoiceUnit ?? "").trim() || "no unit"}" but the item is costed per "${String(input.masterUnit ?? "").trim() || "no unit"}". Cost unchanged until a person converts it.`,
    };
  }
  const prev = Number(input.previousCost);
  if (Number.isFinite(prev) && prev > 0) {
    const ratio = next / prev;
    if (ratio > MAX_AUTOMATIC_COST_RATIO || ratio < 1 / MAX_AUTOMATIC_COST_RATIO) {
      return {
        apply: false,
        code: "IMPLAUSIBLE_CHANGE",
        reason: `The invoice price (${next.toFixed(4)}) is ${ratio.toFixed(2)}× the current cost (${prev.toFixed(4)}). Cost unchanged until a person confirms it (a pack size is the usual cause).`,
      };
    }
  }
  return { apply: true };
}
