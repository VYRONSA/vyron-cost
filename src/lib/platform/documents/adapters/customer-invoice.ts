import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerInvoice } from "@/lib/vyron-customer-invoices";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import {
  renderDocumentPdf,
  type DocumentPdfModel,
  type DocumentPdfNotice,
  type DocumentPdfPaymentDetails,
} from "@/lib/platform/documents/vyron-document-pdf-engine";
import {
  DOCUMENT_CLASS_LABELS,
  TAX_TREATMENT_LABELS,
  classifyStoredInvoice,
  summariseStoredInvoiceTax,
  type StoredInvoiceTaxLine,
} from "@/lib/vyron-invoice-tax";
import { toNumber, toDecimal } from "@/lib/vyron-money";
import { normaliseVatStatus } from "@/lib/vyron-tax-profile";

/**
 * The customer invoice document.
 *
 * THIS FILE RENDERS. IT DOES NOT CALCULATE.
 *
 * Every monetary figure below is read from a stored column that the Stage 4 VAT
 * engine wrote, or from the frozen tax snapshot. There is no rate applied to a
 * base anywhere in this file, no 15, and no arithmetic on money beyond the exact
 * decimal helpers used to convert a stored value for display. If a figure looks
 * wrong on the document, the invoice row is wrong — the renderer has no opinion
 * of its own to disagree with it.
 *
 * IDENTITY: SNAPSHOT FIRST
 * An invoice that carries a tax_snapshot renders its supplier and customer tax
 * identity from that snapshot alone. Today's customer VAT number and today's
 * company address are never consulted for such an invoice — a reprint has to
 * reproduce what was issued.
 *
 * Invoices raised before snapshotting existed have none, and one cannot be
 * manufactured for them: nothing records what the tax profile was on the day
 * they went out. Those fall back to live master data and the document says so,
 * prominently, so a reprint is never mistaken for a reproduction.
 */

function blank(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

/** A stored 2-decimal column, formatted for the document. Never recomputed. */
function storedMoney(value: unknown): number {
  return toNumber(toDecimal(value, 2), 2);
}

function formatQty(value: unknown): string {
  const qty = Number(value ?? 0);
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}

export async function buildCustomerInvoiceDocumentModel(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string
): Promise<DocumentPdfModel | null> {
  const loaded = await getCustomerInvoice(supabase, invoiceId, companyId);
  if (!loaded) return null;
  const { invoice, lines } = loaded;

  const snapshot = invoice.tax_snapshot;
  const fromSnapshot = Boolean(snapshot);

  const [branding, { data: workspaceRow }, { data: customer }] = await Promise.all([
    resolveDocumentBranding(companyId),
    supabase
      .from("vyron_workspaces")
      .select(
        "company_name, trading_name, physical_address, postal_address, vat_number, vat_status, registration_number, " +
          "bank_name, bank_account_name, bank_account_number, bank_branch_code, bank_account_type, remittance_email"
      )
      .eq("company_id", companyId)
      .maybeSingle(),
    // Only read for an invoice that has no snapshot. Reading it for a
    // snapshot-backed invoice would invite using it.
    !fromSnapshot && invoice.customer_id
      ? supabase
          .from("vyron_customers")
          .select("*")
          .eq("id", invoice.customer_id)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null as Record<string, unknown> | null }),
  ]);

  // Typed explicitly: the select list is assembled from concatenated strings, so
  // the client cannot infer the row shape from it.
  const workspace = (workspaceRow as Record<string, unknown> | null) ?? null;

  const productIds = Array.from(new Set(lines.map((line) => line.product_id).filter(Boolean))) as string[];
  const productCodeById = new Map<string, string>();
  if (productIds.length) {
    const { data: products } = await supabase.from("vyron_cost_products").select("id, sku").in("id", productIds);
    for (const row of products || []) {
      if (row.sku) productCodeById.set(row.id, String(row.sku));
    }
  }

  /* --------------------------------------------------------- tax presentation */

  const storedLines: StoredInvoiceTaxLine[] = lines.map((line) => ({
    tax_treatment: line.tax_treatment,
    tax_rate: line.tax_rate,
    taxable_amount: line.taxable_amount,
    tax_amount: line.tax_amount,
    discount_amount: line.discount_amount,
    line_total: line.line_total_incl_tax,
  }));

  const summary = summariseStoredInvoiceTax(storedLines);
  // Classification comes from the Stage 4 rules. The R50 / R5,000 thresholds are
  // not restated here, and a snapshot-backed invoice keeps the class it was
  // issued under even if the rules were to change afterwards.
  const documentClass = snapshot
    ? { documentClass: snapshot.tax.documentClass, requiresRecipientDetails: snapshot.tax.requiresRecipientDetails }
    : classifyStoredInvoice(invoice.total_incl_tax, storedLines);

  /* ------------------------------------------------------------- supplier block */

  const supplierName = snapshot
    ? snapshot.supplier.tradingName || snapshot.supplier.legalName
    : blank(workspace?.company_name) || branding.companyName;
  const supplierLegalName = snapshot ? snapshot.supplier.legalName : blank(workspace?.company_name);
  const supplierTrading = snapshot ? snapshot.supplier.tradingName : blank(workspace?.trading_name);
  const supplierAddress = snapshot ? snapshot.supplier.address : blank(workspace?.physical_address) || branding.address;
  const supplierVatNumber = snapshot ? snapshot.supplier.vatNumber : blank(workspace?.vat_number);
  const supplierVatStatus = snapshot ? snapshot.supplier.vatStatus : normaliseVatStatus(workspace?.vat_status);
  const supplierReg = snapshot ? snapshot.supplier.registrationNumber : blank(workspace?.registration_number);

  const supplierLines = [
    // Shown only where the trading name is what heads the block, so the legal
    // entity behind it is still named on the document.
    supplierTrading && supplierLegalName && supplierTrading !== supplierLegalName ? supplierLegalName : null,
    supplierAddress,
    [branding.telephone, branding.email].filter(Boolean).join(" | ") || null,
    supplierVatNumber ? `VAT No: ${supplierVatNumber}` : null,
    supplierReg ? `Reg No: ${supplierReg}` : null,
  ].filter(Boolean) as string[];

  /* ------------------------------------------------------------- customer block */

  const customerVatStatus = snapshot
    ? snapshot.customer?.vatStatus ?? "Unknown"
    : normaliseVatStatus(customer?.vat_status);

  /*
   * A recipient VAT number appears only where the record says the recipient is a
   * registered vendor. The snapshot already dropped it otherwise, and the live
   * path applies the same rule: a number sitting in the field is not evidence of
   * registration, and printing it on a tax invoice would assert one.
   */
  const customerVatNumber = snapshot
    ? snapshot.customer?.vatNumber ?? null
    : customerVatStatus === "Registered"
      ? blank(customer?.vat_number)
      : null;

  const customerName = snapshot
    ? snapshot.customer?.legalName || String(invoice.customer_name || "Customer")
    : String(invoice.customer_name || customer?.customer_name || "Customer");

  const customerAddress = snapshot ? snapshot.customer?.address ?? null : blank(customer?.billing_address);
  const customerTrading = snapshot ? snapshot.customer?.tradingName ?? null : blank(customer?.trading_name);
  const customerReg = snapshot ? snapshot.customer?.registrationNumber ?? null : blank(customer?.registration_number);

  const customerLines = [
    customerTrading && customerTrading !== customerName ? `t/a ${customerTrading}` : null,
    customerAddress,
    fromSnapshot ? null : [blank(customer?.email), blank(customer?.phone)].filter(Boolean).join(" | ") || null,
    customerVatNumber ? `VAT No: ${customerVatNumber}` : null,
    customerReg ? `Reg No: ${customerReg}` : null,
    // Stated explicitly rather than left to inference from a missing number:
    // an absent VAT line could mean "not registered" or "we never asked".
    customerVatNumber ? null : `VAT Status: ${customerVatStatus === "Unknown" ? "Not provided" : customerVatStatus}`,
  ].filter(Boolean) as string[];

  /* ---------------------------------------------------------------- provenance */

  /*
   * NO HISTORICAL-REPRINT BANNER.
   *
   * Stage 5 assumed an invoice without a tax snapshot had been issued to a
   * customer before snapshotting existed, and stamped every such document with
   * "Historical reprint — not a reproduction of the issued document". That is
   * wrong for this workflow: these invoices were raised in VYRON COST and were
   * not sent to customers, so there is no earlier issued document for the
   * reprint to differ from, and the banner told the reader something untrue.
   *
   * The lack of a snapshot is still not hidden — the Tax Details meta field
   * below states plainly whether the tax identity is the one captured at issue
   * or the current profile. What is removed is the claim that the document is a
   * reproduction of something previously issued.
   *
   * Nothing about the figures changes. The banner was presentation only: no
   * amount, rate, treatment, snapshot or database record is read or written
   * differently because of this.
   */
  const notice: DocumentPdfNotice | null = null;

  /*
   * The words "Tax Invoice" are a SARS requirement, and only apply where the
   * supplier is a registered vendor. An unregistered supplier issues an
   * "Invoice", and calling it a tax invoice would be a false claim.
   */
  const isTaxInvoice = supplierVatStatus === "Registered";
  const docTitle = isTaxInvoice ? "Tax Invoice" : "Invoice";
  const docClassLabel = isTaxInvoice ? DOCUMENT_CLASS_LABELS[documentClass.documentClass] : null;

  /* ------------------------------------------------------------ banking details */

  const bankFields = [
    { label: "Bank", value: blank(workspace?.bank_name) },
    { label: "Account Name", value: blank(workspace?.bank_account_name) },
    { label: "Account Number", value: blank(workspace?.bank_account_number) },
    { label: "Branch Code", value: blank(workspace?.bank_branch_code) },
    { label: "Account Type", value: blank(workspace?.bank_account_type) },
    { label: "Remittance To", value: blank(workspace?.remittance_email) },
  ].filter((field) => field.value) as { label: string; value: string }[];

  const paymentDetails: DocumentPdfPaymentDetails | null = bankFields.length
    ? {
        heading: "Banking Details",
        fields: bankFields,
        reference: `Please use ${invoice.invoice_number} as your payment reference.`,
      }
    : null;

  /* ------------------------------------------------------------------- the model */

  const anyDiscount = lines.some((line) => Number(line.discount_amount || 0) !== 0);

  return {
    docTitle,
    docClassLabel,
    docNumber: String(invoice.invoice_number),
    branding: {
      ...branding,
      // The header band must agree with the supplier block. On a snapshot-backed
      // invoice that means the frozen identity, not the current branding record.
      companyName: supplierLegalName || branding.companyName,
      tradingName: supplierTrading,
      address: supplierAddress,
      vatNumber: supplierVatNumber,
      registrationNumber: supplierReg,
    },
    notice,
    parties: [
      { heading: "From", name: supplierName, lines: supplierLines },
      { heading: "Bill To", name: customerName, lines: customerLines },
    ],
    meta: [
      { label: "Invoice Number", value: String(invoice.invoice_number) },
      { label: "Invoice Date", value: invoice.invoice_date ? String(invoice.invoice_date).slice(0, 10) : "-" },
      { label: "Due Date", value: invoice.due_date ? String(invoice.due_date).slice(0, 10) : "-" },
      { label: "Status", value: String(invoice.status) },
      { label: "Currency", value: "ZAR (South African Rand)" },
      {
        label: "Tax Details",
        value: fromSnapshot
          ? `Captured ${String(invoice.tax_snapshot_at || "").slice(0, 10)}`
          : "Company tax profile",
      },
    ],
    lineColumns: [
      { key: "code", label: "Code", width: 20 },
      { key: "product", label: "Description" },
      { key: "qty", label: "Qty", align: "right", width: 14 },
      { key: "unitPrice", label: "Unit Price", align: "right", width: 22 },
      ...(anyDiscount ? [{ key: "discount", label: "Discount", align: "right" as const, width: 20 }] : []),
      { key: "taxable", label: "Taxable Amt", align: "right", width: 24 },
      { key: "vatRate", label: "VAT", align: "right", width: 26 },
      { key: "vatAmount", label: "VAT Amt", align: "right", width: 22 },
      { key: "lineTotal", label: "Line Total", align: "right", width: 24 },
    ],
    lineRows: lines.map((line) => {
      const treatment = line.tax_treatment;
      return {
        code: (line.product_id && productCodeById.get(line.product_id)) || "-",
        product: String(line.product_name),
        qty: formatQty(line.quantity),
        unitPrice: storedMoney(line.selling_price).toFixed(2),
        discount: Number(line.discount_amount || 0) ? storedMoney(line.discount_amount).toFixed(2) : "-",
        /*
         * A line with no recorded treatment shows the pre-VAT-engine line_total
         * as its taxable amount and "Not recorded" for VAT. It is not shown as
         * 0.00 VAT: nobody ever determined that it was zero.
         */
        taxable: treatment === null
          ? storedMoney(line.line_total).toFixed(2)
          : storedMoney(line.taxable_amount).toFixed(2),
        vatRate: treatment === null
          ? "Not recorded"
          : treatment === "Standard"
            ? `${storedMoney(line.tax_rate).toFixed(2)}%`
            : TAX_TREATMENT_LABELS[treatment],
        vatAmount: treatment === null ? "-" : storedMoney(line.tax_amount).toFixed(2),
        lineTotal: treatment === null
          ? storedMoney(line.line_total).toFixed(2)
          : storedMoney(line.line_total_incl_tax).toFixed(2),
      };
    }),
    totals: {
      // Read straight off the invoice row. sales_value + tax_total = total_incl_tax
      // holds because total_incl_tax is a generated column over the other two —
      // the renderer does not add them up and hope.
      subtotal: storedMoney(invoice.sales_value),
      discountTotal: toNumber(summary.discountTotal, 2) || undefined,
      vatAmount: storedMoney(invoice.tax_total),
      vatSummary: summary.groups.map((group) => ({
        rate: group.treatment === "Standard" ? `VAT @ ${group.rateLabel}` : TAX_TREATMENT_LABELS[group.treatment],
        base: toNumber(group.base, 2),
        vat: toNumber(group.vat, 2),
      })),
      grandTotal: storedMoney(invoice.total_incl_tax),
      currency: "ZAR",
    },
    paymentDetails,
    notes: invoice.notes ? String(invoice.notes) : null,
    generatedAtIso: new Date().toISOString(),
  };
}

export async function buildCustomerInvoicePdf(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string
): Promise<{ bytes: Uint8Array; invoiceNumber: string } | null> {
  const model = await buildCustomerInvoiceDocumentModel(supabase, companyId, invoiceId);
  if (!model) return null;
  return { bytes: renderDocumentPdf(model), invoiceNumber: model.docNumber };
}
