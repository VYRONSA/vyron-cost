import type { CustomerInvoiceLineInput } from "@/lib/vyron-customer-invoices";
import { calculateInvoiceTax, type TaxTreatment } from "@/lib/vyron-invoice-tax";
import { toNumber } from "@/lib/vyron-money";
import { CHANNEL_LABEL, round2, type SaleRefund, type SaleShipping, type StoreSale } from "@/lib/store-sales/types";

/**
 * Store sale / refund → the lines VOLORA's own invoice pipeline takes, plus a
 * reconciliation against what the store itself charged or refunded.
 * Channel-neutral: Shopify and WooCommerce are planned by the same rules.
 *
 * Pure. Nothing here writes. VAT is NOT copied from the store: the invoice
 * engine computes it from the rate, as for an invoice typed into VOLORA, and it
 * must agree with the store (within rounding). Only what cannot be recorded
 * correctly stops the one order concerned — never the integration.
 */

export type SaleIssue = { code: string; message: string; key?: string | null; lineName?: string | null; detail?: Record<string, string | null> };

/** Rounding allowed between VOLORA's engine and the store: one cent per line, at least two. */
export function tolerance(lineCount: number): number {
  return round2(Math.max(0.02, 0.01 * lineCount));
}

function treatmentFor(rate: number | null): { taxTreatment: TaxTreatment; taxRate: number } {
  // A line the store charged no VAT on is recorded zero-rated (e.g. basic
  // foodstuffs). Documented assumption: exempt supplies are not distinguished.
  return rate !== null && rate > 0 ? { taxTreatment: "Standard", taxRate: rate } : { taxTreatment: "Zero Rated", taxRate: 0 };
}

function engineTotals(lines: CustomerInvoiceLineInput[], pricesIncludeTax: boolean, allowCreditLines = false) {
  const totals = calculateInvoiceTax(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.sellingPrice,
      taxTreatment: (line.taxTreatment as TaxTreatment) || "Standard",
      taxRate: line.taxRate ?? 0,
      discountAmount: line.discountAmount ?? 0,
      discountPercent: 0,
    })),
    { pricesIncludeTax, allowCreditLines }
  );
  return { subtotal: toNumber(totals.subtotalExclTax, 2), tax: toNumber(totals.taxTotal, 2), total: toNumber(totals.totalInclTax, 2) };
}

function checkRates(rates: Array<number | null>, workspaceRate: number, issues: SaleIssue[]) {
  if (rates.some((rate) => rate === null)) {
    issues.push({ code: "TAX_RATE_UNKNOWN", message: "The store did not state the VAT rate on a charged line. VOLORA does not guess a rate; check the store's tax settings." });
  }
  const odd = [...new Set(rates.filter((rate): rate is number => rate !== null && rate > 0 && Math.abs(rate - workspaceRate) > 0.0001))];
  if (odd.length) {
    issues.push({
      code: "TAX_RATE_MISMATCH",
      message: `The store charged VAT at ${odd.join(", ")}% but the company's VAT rate is ${workspaceRate}%. Correct the store's tax settings or the company rate, then retry.`,
    });
  }
}

/** Shipping, fees and other charges without a product: a line each, with the VAT the store charged on it. */
function chargeLines(sale: StoreSale): Array<{ charge: SaleShipping; line: CustomerInvoiceLineInput }> {
  return [...sale.shipping.map((c) => ({ c, kind: "Shipping" })), ...sale.otherCharges.map((c) => ({ c, kind: "Charge" }))]
    .filter(({ c }) => c.amount > 0 || c.discount > 0)
    .map(({ c, kind }) => ({
      charge: c,
      line: {
        productId: null,
        productName: `${kind} — ${c.title} (${CHANNEL_LABEL[sale.channel]} ${sale.orderNumber})`,
        quantity: 1,
        sellingPrice: c.amount,
        costPerUnit: 0,
        discountAmount: Math.min(c.discount, c.amount),
        ...treatmentFor(c.taxRate),
      },
    }));
}

/** The rate a store applied to a line, treating "no tax charged, no rate stated" as 0 %. */
const statedRate = (rate: number | null, tax: number) => (tax !== 0 || rate !== null ? rate : 0);

export type SaleInvoicePlan = {
  lines: CustomerInvoiceLineInput[];
  issues: SaleIssue[];
  engine: { subtotal: number; tax: number; total: number } | null;
  store: { tax: number; total: number | null };
};

/**
 * The invoice lines for one store order. `products` maps each sale line id to
 * its VOLORA product and cost (the cost basis an invoice typed into VOLORA uses).
 */
export function planSaleInvoice(sale: StoreSale, products: Map<string, { productId: string; costPerUnit: number }>, options: { workspaceRate: number }): SaleInvoicePlan {
  const issues: SaleIssue[] = [];
  const lines: CustomerInvoiceLineInput[] = [];
  const charged = sale.lines.filter((line) => line.quantity > 0);

  for (const line of charged) {
    const product = products.get(line.lineId);
    if (!product) continue; // mapping issues are raised by the caller
    if (line.discount > round2(line.quantity * line.unitPrice)) {
      issues.push({ code: "DISCOUNT_EXCEEDS_LINE", message: `${line.name}: the discount exceeds the line value.`, lineName: line.name });
      continue;
    }
    lines.push({
      productId: product.productId,
      productName: line.name,
      quantity: line.quantity,
      sellingPrice: line.unitPrice,
      costPerUnit: product.costPerUnit,
      discountAmount: line.discount,
      ...treatmentFor(line.taxRate),
    });
  }
  const charges = chargeLines(sale);
  lines.push(...charges.map((c) => c.line));

  checkRates([...charged.map((l) => statedRate(l.taxRate, l.tax)), ...charges.map((c) => statedRate(c.charge.taxRate, c.charge.tax))], options.workspaceRate, issues);

  const storeTax = round2(charged.reduce((t, l) => t + l.tax, 0) + charges.reduce((t, c) => t + c.charge.tax, 0));
  // The store's own order total is comparable only when no units were removed by an edit.
  const storeTotal = sale.edited || sale.totals.total === null ? null : sale.totals.total;
  if (!lines.length) return { lines, issues, engine: null, store: { tax: storeTax, total: storeTotal } };

  let engine: SaleInvoicePlan["engine"] = null;
  try {
    engine = engineTotals(lines, sale.taxesIncluded);
  } catch (error) {
    issues.push({ code: "TAX_ENGINE_REFUSED", message: error instanceof Error ? error.message : String(error) });
    return { lines, issues, engine, store: { tax: storeTax, total: storeTotal } };
  }
  const allowed = tolerance(lines.length);
  if (Math.abs(engine.tax - storeTax) > allowed) {
    issues.push({ code: "TAX_MISMATCH", message: `VAT calculated by VOLORA (${engine.tax.toFixed(2)}) differs from the VAT the store charged (${storeTax.toFixed(2)}).` });
  }
  if (storeTotal !== null && Math.abs(engine.total - storeTotal) > allowed) {
    issues.push({
      code: "TOTAL_MISMATCH",
      message: `The invoice total VOLORA would record (${engine.total.toFixed(2)}) differs from the store's order total (${storeTotal.toFixed(2)}), e.g. a tip, gift card or duty the store data does not itemise.`,
    });
  }
  return { lines, issues, engine, store: { tax: storeTax, total: storeTotal } };
}

export type CreditPlan = { lines: CustomerInvoiceLineInput[]; issues: SaleIssue[]; engine: { tax: number; total: number } | null };

/**
 * The credit-note lines for one store refund, reversing the applicable part of
 * the sale: each refunded unit is credited at the store's refunded amount with
 * the original line's VAT treatment, and its cost of sales is reversed at the
 * cost the invoice carried. Refunded shipping is credited as shipping. Money
 * the store refunded without itemising it (a shipping refund WooCommerce does
 * not itemise, a goodwill amount) is credited as one line at the order's VAT
 * rate — and stops for a person only if the order mixed VAT rates.
 */
export function planRefundCredit(
  sale: StoreSale,
  refund: SaleRefund,
  originalLines: Map<string, { productId: string; costPerUnit: number }>,
  options: { workspaceRate: number }
): CreditPlan {
  const issues: SaleIssue[] = [];
  const lines: CustomerInvoiceLineInput[] = [];
  const byLineId = new Map(sale.lines.map((line) => [line.lineId, line]));
  const label = `${CHANNEL_LABEL[sale.channel]} ${sale.orderNumber}`;

  if (refund.truncated) {
    issues.push({ code: "REFUND_TOO_LARGE", message: `Refund ${refund.refundId} has more lines than one request returns; credit it manually.` });
  }
  for (const refunded of refund.lines) {
    const line = byLineId.get(refunded.lineId);
    const original = originalLines.get(refunded.lineId);
    if (!line || !original) {
      issues.push({ code: "REFUND_LINE_UNKNOWN", message: `Refund ${refund.refundId} refers to an item that is not on the recorded invoice.` });
      continue;
    }
    lines.push({
      productId: original.productId,
      productName: `Refund — ${line.name}`,
      quantity: -refunded.quantity,
      sellingPrice: Math.round((refunded.subtotal / refunded.quantity) * 10000) / 10000,
      costPerUnit: original.costPerUnit,
      discountAmount: 0,
      ...treatmentFor(line.taxRate),
    });
  }
  const shippingRate = sale.shipping.find((s) => (s.taxRate ?? 0) > 0)?.taxRate ?? 0;
  for (const shipping of refund.shipping) {
    if (shipping.subtotal === 0) continue;
    lines.push({
      productId: null,
      productName: `Shipping refund (${label})`,
      quantity: -1,
      sellingPrice: shipping.subtotal,
      costPerUnit: 0,
      discountAmount: 0,
      ...treatmentFor(shipping.tax !== 0 ? shippingRate : 0),
    });
  }
  if (issues.length) return { lines, issues, engine: null };

  // The itemised part must agree with the store's own VAT on those items.
  let itemised = { tax: 0, total: 0 };
  if (lines.length) {
    try {
      itemised = engineTotals(lines, sale.taxesIncluded, true);
    } catch (error) {
      return { lines, issues: [{ code: "TAX_ENGINE_REFUSED", message: error instanceof Error ? error.message : String(error) }], engine: null };
    }
    const storeTax = round2(refund.lines.reduce((t, l) => t + l.tax, 0) + refund.shipping.reduce((t, s) => t + s.tax, 0));
    if (Math.abs(Math.abs(itemised.tax) - Math.abs(storeTax)) > tolerance(lines.length)) {
      issues.push({ code: "REFUND_TAX_MISMATCH", message: `VAT on the credit (${Math.abs(itemised.tax).toFixed(2)}) differs from the VAT the store refunded (${Math.abs(storeTax).toFixed(2)}).` });
      return { lines, issues, engine: null };
    }
  }

  // Money refunded beyond the itemised lines.
  const remainder = round2(refund.total - Math.abs(itemised.total));
  const allowed = tolerance(lines.length + 1);
  if (remainder < -allowed) {
    issues.push({ code: "REFUND_UNRECONCILED", message: `Refund ${refund.refundId}: the items refunded (${Math.abs(itemised.total).toFixed(2)}) exceed the money refunded (${refund.total.toFixed(2)}).` });
    return { lines, issues, engine: null };
  }
  if (remainder > allowed) {
    const rates = [
      ...new Set(
        [...sale.lines.filter((l) => l.quantity > 0).map((l) => l.taxRate), ...sale.shipping.filter((s) => s.amount > 0).map((s) => s.taxRate), ...sale.otherCharges.map((c) => c.taxRate)].map((r) => r ?? 0)
      ),
    ];
    if (rates.length > 1) {
      issues.push({
        code: "REFUND_VAT_UNDETERMINED",
        message: `Refund ${refund.refundId} includes ${remainder.toFixed(2)} not tied to an item, on an order with more than one VAT rate; credit that amount manually.`,
      });
      return { lines, issues, engine: null };
    }
    const rate = rates[0] ?? 0;
    lines.push({
      productId: null,
      productName: `Refund — amount not itemised by the store (${label})${refund.note ? `: ${refund.note}` : ""}`.slice(0, 300),
      quantity: -1,
      // The remainder is money returned, VAT included; state it in the order's price basis.
      sellingPrice: sale.taxesIncluded || rate === 0 ? remainder : Math.round((remainder / (1 + rate / 100)) * 10000) / 10000,
      costPerUnit: 0,
      discountAmount: 0,
      ...treatmentFor(rate),
    });
  }
  if (!lines.length) return { lines, issues, engine: null };

  checkRates(lines.map((l) => Number(l.taxRate || 0)), options.workspaceRate, issues);
  let engine: CreditPlan["engine"] = null;
  try {
    const totals = engineTotals(lines, sale.taxesIncluded, true);
    engine = { tax: totals.tax, total: totals.total };
  } catch (error) {
    issues.push({ code: "TAX_ENGINE_REFUSED", message: error instanceof Error ? error.message : String(error) });
    return { lines, issues, engine };
  }
  if (Math.abs(Math.abs(engine.total) - refund.total) > tolerance(lines.length)) {
    issues.push({ code: "REFUND_UNRECONCILED", message: `The credit VOLORA would record (${Math.abs(engine.total).toFixed(2)}) differs from the amount the store refunded (${refund.total.toFixed(2)}).` });
  }
  return { lines, issues, engine };
}
