/**
 * The customer invoice VAT engine.
 *
 * This is the single place where invoice tax is decided. The legal thresholds it
 * applies come from vyron-tax-profile.ts, which already owns them for the master
 * data screens — they are not restated here.
 *
 * WHAT THIS REPLACES
 * Before this module, `createCustomerInvoice` wrote sales_value, cost_value and
 * gross_profit and never touched tax_total, so every invoice the application
 * created carried R0.00 VAT. The invoice screen showed a VAT figure it had worked
 * out in the browser from a hard-coded 15 and then dropped from the request body,
 * and the PDF adapter passed `vatAmount: 0` outright. VAT now lives on the line,
 * is computed here, and is stored.
 *
 * ARITHMETIC
 * Everything runs through vyron-money.ts, which is exact bigint fixed point. No
 * financial figure in this file is produced by floating-point arithmetic.
 *
 * ROUNDING RULE (one rule, applied in this order, per line):
 *   1. gross      = quantity x unit_price          exact, then rounded to the cent
 *   2. discount   = percent of gross, or the explicit amount   rounded to the cent
 *   3. taxable    = gross - discount                           already in cents
 *   4. tax        = taxable x rate / 100                       rounded to the cent
 *   5. line total = taxable + tax                              exact, no rounding
 * The invoice totals are plain sums of values that are already whole cents, so
 * SUM(taxable) + SUM(tax) = SUM(line total) holds identically, with no residual
 * cent to allocate. Rounding is half-up away from zero.
 *
 * On a VAT-inclusive line the unit price already contains the tax, so step 1
 * produces the inclusive gross, step 3 the inclusive taxable base, and the tax is
 * extracted as base x rate / (100 + rate) before the exclusive amount is derived.
 */

import {
  FULL_TAX_INVOICE_THRESHOLD,
  NO_TAX_INVOICE_THRESHOLD,
  normaliseVatNumber,
  normaliseVatStatus,
  supplierProfileGaps,
  type VatStatus,
} from "@/lib/vyron-tax-profile";
import {
  add,
  compare,
  toFixed,
  dec,
  div,
  divPow10,
  gt,
  money,
  mul,
  sub,
  sum,
  toDecimal,
  toNumber,
  ZERO,
  type Decimal,
} from "@/lib/vyron-money";

// The build targets ES2017, where BigInt literals (`100n`) are a syntax error.
const B0 = BigInt(0);
const B100 = BigInt(100);

/* ------------------------------------------------------------------ treatments */

/**
 * The VAT treatments an invoice line can carry.
 *
 * "Standard" is not the default for every line merely because the company is a
 * registered vendor — basic foodstuffs and exports are zero rated, and a line's
 * treatment is a property of the supply, not of the supplier.
 */
export const TAX_TREATMENTS = ["Standard", "Zero Rated", "Exempt", "No VAT"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  Standard: "Standard Rated",
  "Zero Rated": "Zero Rated (0%)",
  Exempt: "Exempt",
  "No VAT": "No VAT / Outside Scope",
};

/** Treatments that carry a rate the user may set. Everything else is fixed at 0%. */
export function treatmentCarriesRate(treatment: TaxTreatment) {
  return treatment === "Standard";
}

export function normaliseTaxTreatment(value: unknown): TaxTreatment | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return TAX_TREATMENTS.find((t) => t.toLowerCase() === raw.toLowerCase()) ?? null;
}

/* ---------------------------------------------------------------------- scales */

/** Matches the column precisions so nothing is silently truncated on the way in. */
export const QUANTITY_SCALE = 4;
export const PRICE_SCALE = 4;
export const RATE_SCALE = 4;

/* ------------------------------------------------------------------ line input */

export type InvoiceTaxLineInput = {
  quantity: unknown;
  /** Unit price. Exclusive of VAT unless `pricesIncludeTax` is set on the invoice. */
  unitPrice: unknown;
  taxTreatment: TaxTreatment;
  /** Percent, e.g. 15 for 15%. Ignored and forced to 0 for non-standard treatments. */
  taxRate?: unknown;
  discountPercent?: unknown;
  discountAmount?: unknown;
};

export type InvoiceTaxLineResult = {
  taxTreatment: TaxTreatment;
  /** quantity x unit price, before any discount. */
  gross: Decimal;
  discountAmount: Decimal;
  /** The base the rate is applied to, always exclusive of VAT. */
  taxableAmount: Decimal;
  taxRate: Decimal;
  taxAmount: Decimal;
  lineTotalInclTax: Decimal;
};

/**
 * A rate is only meaningful on a standard-rated line. Zero rated is 0% by
 * definition; exempt and out-of-scope supplies carry no rate at all. Forcing it
 * here means a stale 15 left on a line that was switched to zero rated cannot
 * produce VAT.
 */
function resolveRate(treatment: TaxTreatment, rate: unknown): Decimal {
  if (!treatmentCarriesRate(treatment)) return dec(B0, RATE_SCALE);
  const resolved = toDecimal(rate ?? 0, RATE_SCALE);
  if (compare(resolved, ZERO) < 0) {
    throw new Error("A VAT rate cannot be negative.");
  }
  return resolved;
}

export function calculateInvoiceTaxLine(
  line: InvoiceTaxLineInput,
  options: { pricesIncludeTax?: boolean } = {}
): InvoiceTaxLineResult {
  const treatment = line.taxTreatment;
  const quantity = toDecimal(line.quantity, QUANTITY_SCALE);
  const unitPrice = toDecimal(line.unitPrice, PRICE_SCALE);
  const rate = resolveRate(treatment, line.taxRate);

  // 1. gross
  const gross = money(mul(quantity, unitPrice));

  // 2. discount — an explicit amount wins over a percentage, so a operator who
  //    typed a rand figure gets exactly that figure and not a re-derived one.
  const explicitDiscount = toDecimal(line.discountAmount ?? 0, 2);
  const discountPercent = toDecimal(line.discountPercent ?? 0, RATE_SCALE);
  const discountAmount = !isZeroish(explicitDiscount)
    ? money(explicitDiscount)
    : money(divPow10(mul(gross, discountPercent), 2));

  if (gt(discountAmount, gross)) {
    throw new Error("A line discount cannot exceed the line value.");
  }

  // 3. taxable base
  const base = sub(gross, discountAmount);

  let taxableAmount: Decimal;
  let taxAmount: Decimal;

  if (options.pricesIncludeTax) {
    // base already contains the tax: tax = base x rate / (100 + rate)
    const hundred = dec(B100, 0);
    const divisor = add(hundred, rate);
    taxAmount = compare(rate, ZERO) === 0 ? money(ZERO) : money(div(mul(base, rate), divisor, 8));
    taxableAmount = sub(base, taxAmount);
  } else {
    taxableAmount = base;
    // 4. tax = taxable x rate / 100. Dividing by 100 is a scale shift, so the
    //    only rounding is the final one to the cent.
    taxAmount = money(divPow10(mul(taxableAmount, rate), 2));
  }

  return {
    taxTreatment: treatment,
    gross,
    discountAmount,
    taxableAmount,
    taxRate: rate,
    taxAmount,
    // 5. two cent-scale values added — exact, nothing to round.
    lineTotalInclTax: add(taxableAmount, taxAmount),
  };
}

function isZeroish(value: Decimal) {
  return compare(value, ZERO) === 0;
}

/* --------------------------------------------------------------- invoice totals */

export type InvoiceTaxTotals = {
  subtotalExclTax: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  totalInclTax: Decimal;
  lines: InvoiceTaxLineResult[];
};

export function calculateInvoiceTax(
  lines: InvoiceTaxLineInput[],
  options: { pricesIncludeTax?: boolean } = {}
): InvoiceTaxTotals {
  const results = lines.map((line) => calculateInvoiceTaxLine(line, options));
  const subtotalExclTax = sum(results.map((r) => r.taxableAmount));
  const taxTotal = sum(results.map((r) => r.taxAmount));
  return {
    subtotalExclTax,
    discountTotal: sum(results.map((r) => r.discountAmount)),
    taxTotal,
    // Every addend is already a whole number of cents, so this equals
    // SUM(line totals) exactly. There is never a residual cent to allocate.
    totalInclTax: add(subtotalExclTax, taxTotal),
    lines: results,
  };
}

/* -------------------------------------------------------------- document class */

export type InvoiceDocumentClass = "full" | "abridged" | "none-required";

export type DocumentClassResult = {
  documentClass: InvoiceDocumentClass;
  /** True when the recipient's name, address and VAT number must appear. */
  requiresRecipientDetails: boolean;
  reason: string;
};

/**
 * Which document SARS requires at this consideration.
 *
 * The value tested is the consideration — the VAT-inclusive amount — because that
 * is what s20(4) and s20(5) are written against.
 *
 * The zero-rated carve-out is deliberate. A low-value supply would ordinarily fall
 * under the abridged rules, or under R50 need no tax invoice at all, but a zero
 * rated or exempt supply has to be evidenced as such: dropping the recipient
 * details because the amount was small would leave nothing on the document tying
 * the zero rating to a customer. Those supplies are therefore always treated as
 * requiring the full set of details, whatever the value.
 */
export function classifyInvoiceDocument(
  totalInclTax: Decimal,
  lines: Pick<InvoiceTaxLineResult, "taxTreatment">[]
): DocumentClassResult {
  const hasNonStandard = lines.some((line) => line.taxTreatment === "Zero Rated" || line.taxTreatment === "Exempt");
  if (hasNonStandard) {
    return {
      documentClass: "full",
      requiresRecipientDetails: true,
      reason:
        "The invoice carries a zero rated or exempt supply, which must be evidenced with the recipient's details regardless of value.",
    };
  }

  const full = dec(BigInt(FULL_TAX_INVOICE_THRESHOLD), 0);
  const none = dec(BigInt(NO_TAX_INVOICE_THRESHOLD), 0);

  if (compare(totalInclTax, none) <= 0) {
    return {
      documentClass: "none-required",
      requiresRecipientDetails: false,
      reason: `The consideration does not exceed R${NO_TAX_INVOICE_THRESHOLD}, so no tax invoice is required — a document showing the VAT charged is enough.`,
    };
  }
  if (compare(totalInclTax, full) <= 0) {
    return {
      documentClass: "abridged",
      requiresRecipientDetails: false,
      reason: `The consideration does not exceed R${FULL_TAX_INVOICE_THRESHOLD.toLocaleString("en-ZA")}, so an abridged tax invoice is permitted (VAT Act s20(5)).`,
    };
  }
  return {
    documentClass: "full",
    requiresRecipientDetails: true,
    reason: `The consideration exceeds R${FULL_TAX_INVOICE_THRESHOLD.toLocaleString("en-ZA")}, so a full tax invoice is required (VAT Act s20(4)).`,
  };
}

/* -------------------------------------------------------------------- snapshot */

export type PartyTaxSnapshot = {
  legalName: string;
  tradingName: string | null;
  address: string | null;
  vatNumber: string | null;
  vatStatus: VatStatus;
  registrationNumber: string | null;
};

export type InvoiceTaxSnapshot = {
  version: 1;
  capturedAt: string;
  capturedAtStatus: string;
  supplier: PartyTaxSnapshot;
  customer: PartyTaxSnapshot | null;
  tax: {
    documentClass: InvoiceDocumentClass;
    requiresRecipientDetails: boolean;
    /** Distinct treatments present on the invoice, and the rate each was charged at. */
    treatments: { treatment: TaxTreatment; rate: string }[];
    defaultRate: string;
    pricesIncludeTax: boolean;
    subtotalExclTax: string;
    taxTotal: string;
    totalInclTax: string;
    currency: "ZAR";
  };
};

function blankToNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

/**
 * A recipient VAT number only goes on the document when the customer record says
 * they are a registered vendor. A number sitting in the field is not evidence of
 * registration — it may be a stale import or a reference captured by hand — and
 * printing it would assert a registration nobody confirmed.
 */
export function buildPartySnapshot(row: Record<string, unknown> | null, kind: "supplier" | "customer"): PartyTaxSnapshot | null {
  if (!row) return null;
  const vatStatus = normaliseVatStatus(row.vat_status);
  const vatNumber = normaliseVatNumber(kind === "supplier" ? row.vat_number : row.vat_number);
  return {
    legalName: String((kind === "supplier" ? row.company_name : row.customer_name) ?? "").trim(),
    tradingName: blankToNull(row.trading_name),
    address: blankToNull(kind === "supplier" ? row.physical_address : row.billing_address),
    vatNumber: vatStatus === "Registered" && vatNumber ? vatNumber : null,
    vatStatus,
    registrationNumber: blankToNull(row.registration_number),
  };
}

/* ------------------------------------------------------------------ validation */

export type IssueValidationInput = {
  supplier: PartyTaxSnapshot;
  customer: PartyTaxSnapshot | null;
  totals: Pick<InvoiceTaxTotals, "totalInclTax" | "taxTotal">;
  documentClass: DocumentClassResult;
  invoiceNumber: string;
  invoiceDate: string | null;
  lineCount: number;
};

/**
 * What must be true before an invoice stops being a draft.
 *
 * Returns the blocking reasons; an empty list means the invoice may be issued.
 * These are refusals, not warnings — an invoice issued without them is not a
 * valid tax invoice, and re-issuing a corrected one after the fact means a credit
 * note.
 */
export function validateInvoiceForIssue(input: IssueValidationInput): string[] {
  const errors: string[] = [];

  if (!input.lineCount) {
    errors.push("The invoice has no lines.");
  }
  if (!input.invoiceNumber.trim()) {
    errors.push("The invoice has no invoice number.");
  }
  if (!input.invoiceDate) {
    errors.push("The invoice has no invoice date.");
  }

  /*
   * The supplier-side checks are not restated here. supplierProfileGaps owns them,
   * and the Company Setup readiness card calls the same function — so the reason
   * an invoice is blocked and the reason Company Setup shows as incomplete are
   * always literally the same list, and cannot drift apart as either changes.
   *
   * defaultVatRate is not part of this check: the invoice already carries the
   * rates its lines were computed at, so a missing workspace default cannot make
   * an already-priced invoice unissuable. resolveDefaultVatRate refuses at the
   * point a rate is actually needed.
   */
  for (const gap of supplierProfileGaps({
    companyName: input.supplier.legalName,
    tradingName: input.supplier.tradingName ?? "",
    registrationNumber: input.supplier.registrationNumber ?? "",
    vatStatus: input.supplier.vatStatus,
    vatNumber: input.supplier.vatNumber ?? "",
    physicalAddress: input.supplier.address ?? "",
    defaultVatRate: 0,
  })) {
    errors.push(gap.detail);
  }

  if (input.supplier.vatStatus !== "Registered" && compare(input.totals.taxTotal, ZERO) !== 0) {
    errors.push(
      `Your company is marked "${input.supplier.vatStatus}" but this invoice charges VAT. Only a registered vendor may charge VAT.`
    );
  }

  if (input.documentClass.requiresRecipientDetails) {
    if (!input.customer) {
      errors.push("A full tax invoice needs a customer record. Select a customer on the invoice.");
    } else {
      if (!input.customer.legalName) errors.push("The customer has no name.");
      if (!input.customer.address) {
        errors.push("The customer has no billing address. A full tax invoice must show it (VAT Act s20(4)).");
      }
      if (input.customer.vatStatus === "Registered" && !input.customer.vatNumber) {
        errors.push(
          "The customer is marked VAT registered but has no valid VAT number. A full tax invoice must show it, or correct their VAT status."
        );
      }
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ conversions */

/** Shapes an engine result for the `vyron_customer_invoice_lines` columns. */
export function taxLineToColumns(result: InvoiceTaxLineResult) {
  return {
    tax_treatment: result.taxTreatment,
    tax_rate: toNumber(result.taxRate, RATE_SCALE),
    discount_amount: toNumber(result.discountAmount, 2),
    taxable_amount: toNumber(result.taxableAmount, 2),
    tax_amount: toNumber(result.taxAmount, 2),
    line_total_incl_tax: toNumber(result.lineTotalInclTax, 2),
  };
}

/** Shapes engine totals for the `vyron_customer_invoices` columns. */
export function taxTotalsToColumns(totals: InvoiceTaxTotals) {
  return {
    sales_value: toNumber(totals.subtotalExclTax, 2),
    tax_total: toNumber(totals.taxTotal, 2),
  };
}

/* ------------------------------------------------- summarising a stored invoice */

export type StoredInvoiceTaxLine = {
  tax_treatment: TaxTreatment | null;
  tax_rate: number | null;
  taxable_amount: number | null;
  tax_amount: number | null;
  discount_amount?: number | null;
  line_total?: number | null;
};

export type StoredTaxGroup = {
  treatment: TaxTreatment;
  /** Formatted rate, e.g. "15.00%". */
  rateLabel: string;
  base: Decimal;
  vat: Decimal;
  lineCount: number;
};

export type StoredInvoiceTaxSummary = {
  groups: StoredTaxGroup[];
  discountTotal: Decimal;
  /** Lines with no recorded treatment — issued before the engine existed. */
  undeterminedLineCount: number;
  hasUndeterminedLines: boolean;
};

/**
 * Group an invoice's *stored* line figures for presentation.
 *
 * This aggregates what the engine already computed and the database already
 * holds. It never applies a rate to a base, so it cannot disagree with the
 * stored values — which is the point: the renderer must show the invoice's own
 * numbers, not a second opinion about them. Summation runs through the exact
 * decimal module, so grouping cannot introduce a cent of drift either.
 *
 * Lines predating the VAT engine carry a NULL treatment. They are counted, not
 * folded into a group and not treated as zero-rated: their VAT was never
 * determined, and presenting them as a measured zero would be an invention.
 */
export function summariseStoredInvoiceTax(lines: StoredInvoiceTaxLine[]): StoredInvoiceTaxSummary {
  const byKey = new Map<string, StoredTaxGroup>();
  let undetermined = 0;
  let discountTotal = ZERO;

  for (const line of lines) {
    discountTotal = add(discountTotal, toDecimal(line.discount_amount ?? 0, 2));

    if (!line.tax_treatment) {
      undetermined += 1;
      continue;
    }

    const rate = toDecimal(line.tax_rate ?? 0, RATE_SCALE);
    const key = `${line.tax_treatment}|${toFixed(rate, RATE_SCALE)}`;
    const existing = byKey.get(key);
    const base = toDecimal(line.taxable_amount ?? 0, 2);
    const vat = toDecimal(line.tax_amount ?? 0, 2);

    if (existing) {
      existing.base = add(existing.base, base);
      existing.vat = add(existing.vat, vat);
      existing.lineCount += 1;
    } else {
      byKey.set(key, {
        treatment: line.tax_treatment,
        rateLabel: `${toFixed(rate, 2)}%`,
        base,
        vat,
        lineCount: 1,
      });
    }
  }

  return {
    // Standard first, then the order the treatments are declared in.
    groups: [...byKey.values()].sort(
      (a, b) => TAX_TREATMENTS.indexOf(a.treatment) - TAX_TREATMENTS.indexOf(b.treatment)
    ),
    discountTotal,
    undeterminedLineCount: undetermined,
    hasUndeterminedLines: undetermined > 0,
  };
}

/**
 * The class of a stored invoice, from its stored consideration and treatments.
 *
 * A thin wrapper so callers never re-derive the R50 / R5,000 rules themselves —
 * classifyInvoiceDocument above remains the only place they exist.
 */
export function classifyStoredInvoice(totalInclTax: unknown, lines: StoredInvoiceTaxLine[]): DocumentClassResult {
  return classifyInvoiceDocument(
    toDecimal(totalInclTax, 2),
    lines
      .filter((line) => line.tax_treatment !== null)
      .map((line) => ({ taxTreatment: line.tax_treatment as TaxTreatment }))
  );
}

export const DOCUMENT_CLASS_LABELS: Record<InvoiceDocumentClass, string> = {
  full: "Full Tax Invoice",
  abridged: "Abridged Tax Invoice",
  "none-required": "Invoice",
};
