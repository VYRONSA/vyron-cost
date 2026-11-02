import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Units and actual supplier cost for costing.
 *
 * An ingredient's purchase_cost / true_unit_cost is per PURCHASE unit (the unit
 * the supplier invoices: kg, l, each). Recipe and BOM lines are often measured
 * in g or ml. Copying a per-kg cost onto a gram line made that line 1000× too
 * expensive (Kingdom Foods, 2026-11: inflated product costs). Every copy of an
 * ingredient cost onto a line goes through convertCostPerUnit, which converts
 * within one dimension (mass, volume, count) and refuses — returns null — when
 * the units are not convertible, so a wrong cost is never written silently.
 */
type Dimension = "mass" | "volume" | "count";
const UNITS: Record<string, { dimension: Dimension; factor: number }> = {
  kg: { dimension: "mass", factor: 1000 },
  g: { dimension: "mass", factor: 1 },
  mg: { dimension: "mass", factor: 0.001 },
  l: { dimension: "volume", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  each: { dimension: "count", factor: 1 },
};
const ALIASES: Record<string, string> = {
  kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  gr: "g", grs: "g", gm: "g", gms: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  milligram: "mg", milligrams: "mg",
  lt: "l", ltr: "l", ltrs: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  ea: "each", unit: "each", units: "each", pc: "each", pcs: "each", piece: "each", pieces: "each", item: "each", items: "each",
};

export function normaliseUnit(unit: unknown): string {
  const raw = String(unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  return ALIASES[raw] || raw;
}

/** Cost per `fromUnit` expressed per `toUnit`; null when the units cannot be converted. */
export function convertCostPerUnit(cost: number, fromUnit: unknown, toUnit: unknown): number | null {
  const from = normaliseUnit(fromUnit);
  const to = normaliseUnit(toUnit);
  if (!Number.isFinite(cost)) return null;
  if (from === to) return cost;
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.dimension !== b.dimension) return null;
  return (cost * b.factor) / a.factor;
}

/** Quantity in `fromUnit` expressed in `toUnit`; null when not convertible. */
export function convertQuantity(quantity: number, fromUnit: unknown, toUnit: unknown): number | null {
  const from = normaliseUnit(fromUnit);
  const to = normaliseUnit(toUnit);
  if (from === to) return quantity;
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.dimension !== b.dimension) return null;
  return (quantity * a.factor) / b.factor;
}

/**
 * The cost a stock RECEIPT is valued at.
 *
 * A purchase order price is what was expected, not what was invoiced. Receiving
 * a PO used to value the stock at the PO price, overwriting the stock cost an
 * approved supplier invoice had set. For an ingredient or packaging item with
 * an actual (invoice-derived) cost, the receipt is valued at that cost,
 * converted into the receipt's unit. Only when no actual cost exists is the PO
 * price used — and it is reported as an estimate.
 */
export async function receiptUnitCost(
  supabase: SupabaseClient,
  companyId: string,
  params: { entityType: string; entityId: string | null | undefined; unit: unknown; poPrice: number }
): Promise<{ unitCost: number; basis: "invoice" | "po_estimate" }> {
  const poPrice = Number(params.poPrice || 0);
  if (!params.entityId || (params.entityType !== "ingredient" && params.entityType !== "packaging")) {
    return { unitCost: poPrice, basis: "po_estimate" };
  }
  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("purchase_cost, purchase_unit")
    .eq("company_id", companyId)
    .eq("id", params.entityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const actual = Number(data?.purchase_cost || 0);
  if (!data || actual <= 0) return { unitCost: poPrice, basis: "po_estimate" };
  const converted = params.unit ? convertCostPerUnit(actual, data.purchase_unit, params.unit) : actual;
  if (converted === null) return { unitCost: poPrice, basis: "po_estimate" };
  return { unitCost: Math.round(converted * 10000) / 10000, basis: "invoice" };
}

/**
 * The usable cost of an ingredient: what is paid per purchase unit divided by
 * its yield. A yield of 80% means R14 paid buys R17.50 of usable product. A
 * missing, zero or out-of-range yield is treated as 100% (no adjustment).
 */
export function trueUnitCostFromYield(purchaseCost: number, yieldPercent: unknown): number {
  const cost = Number(purchaseCost || 0);
  const y = Number(yieldPercent);
  if (!Number.isFinite(y) || y <= 0 || y > 100) return cost;
  return Math.round((cost / (y / 100)) * 100000000) / 100000000;
}

/**
 * May a recipe line's cost be replaced by the verified supplier cost?
 *
 *   "same"     already equal (within 0.5%)
 *   "replace"  no cost yet; ordinary drift within 0.5×–2×; or the classic unit
 *              error — the cost per purchase unit (per kg) sitting on a line in a
 *              smaller unit (per g), i.e. off by exactly the conversion factor
 *   "hold"     anything further apart. Production recipes record pack-unit
 *              ingredients ("box" of jars, "bag" of yeast) with a per-piece cost;
 *              replacing that with the pack price would inflate the product 24×.
 *              Such a line is left as it is and reported for a person to check —
 *              the same 0.5×–2× rule the supplier-cost guard applies to invoices.
 */
export function decideLineCostReplacement(current: number, verified: number, verifiedPerPurchaseUnit: number): "same" | "replace" | "hold" {
  const cur = Number(current || 0);
  if (!(cur > 0) || !(verified > 0)) return "replace";
  if (Math.abs(cur - verified) <= Math.max(0.0001, verified * 0.005)) return "same";
  const ratio = cur / verified;
  if (ratio >= 0.5 && ratio <= 2) return "replace";
  const factor = verifiedPerPurchaseUnit / verified;
  if (Math.abs(factor - 1) > 1e-9) {
    const unitError = ratio / factor;
    if (unitError >= 0.5 && unitError <= 2) return "replace";
  }
  return "hold";
}
