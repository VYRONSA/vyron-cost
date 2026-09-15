/**
 * The authoritative customer-invoice header cost arithmetic.
 *
 * This is the ONE implementation of how an invoice's cost_value, gross_profit
 * and gp_percentage are derived from its lines. It lived inside
 * vyron-customer-invoices.ts; it was extracted here — unchanged — so that a
 * controlled data operation (the Kingdom Foods historical GP correction) can
 * recompute headers with the EXACT routine the application uses, rather than a
 * second, competing rounding algorithm. vyron-customer-invoices.ts imports both
 * functions from here, so there is still a single source of truth.
 *
 * Dependency-free by design: importing this module pulls in no Supabase client,
 * no branch/contact/inventory graph, so a migration script can use it safely.
 */

/** Round to two decimals, matching the invoice writer exactly. */
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Header totals from invoice lines and the (tax-exclusive) sales value.
 *
 * cost_value    = round2(Σ quantity × cost_per_unit)
 * gross_profit  = round2(sales_value − cost_value)
 * gp_percentage = round2(gross_profit / sales_value × 100)   (0 when sales = 0)
 *
 * Selling price, quantity, VAT and sales_value are inputs here, never outputs:
 * this routine only ever produces the three cost/GP fields.
 */
export function computeCostTotals(
  lines: ReadonlyArray<{ quantity: number | string; costPerUnit?: number | string | null }>,
  salesValue: number
) {
  let cost = 0;
  for (const line of lines) {
    cost += Number(line.quantity) * Number(line.costPerUnit || 0);
  }
  const costValue = round2(cost);
  const gp = round2(salesValue - costValue);
  return {
    cost_value: costValue,
    gross_profit: gp,
    gp_percentage: salesValue ? round2((gp / salesValue) * 100) : 0,
  };
}
