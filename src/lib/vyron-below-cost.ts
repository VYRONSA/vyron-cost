/**
 * Selling-price-below-cost check.
 *
 * Compares the net selling price (after line discount, excluding VAT) with the
 * product's unit cost as recorded on the line. It warns only: prices are never
 * changed and nothing is blocked. A line with no recorded cost (0 or missing)
 * cannot be judged and returns `below: false` with `costKnown: false`, because
 * an unknown cost is not evidence of a loss.
 */
export type BelowCostResult = {
  below: boolean;
  costKnown: boolean;
  netPrice: number;
  cost: number;
  /** Cost minus net price per unit (positive when selling below cost). */
  shortfallPerUnit: number;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function checkBelowCost(sellingPrice: unknown, costPerUnit: unknown, discountPct: unknown = 0): BelowCostResult {
  const price = Number(sellingPrice);
  const cost = Number(costPerUnit);
  const discount = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const netPrice = round2((Number.isFinite(price) ? price : 0) * (1 - discount / 100));
  const costKnown = Number.isFinite(cost) && cost > 0;
  if (!costKnown) return { below: false, costKnown: false, netPrice, cost: 0, shortfallPerUnit: 0 };
  const shortfall = round2(cost - netPrice);
  return { below: shortfall > 0, costKnown: true, netPrice, cost: round2(cost), shortfallPerUnit: shortfall > 0 ? shortfall : 0 };
}
