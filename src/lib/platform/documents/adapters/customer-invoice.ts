import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerInvoice } from "@/lib/vyron-customer-invoices";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderDocumentPdf, type DocumentPdfModel } from "@/lib/platform/documents/vyron-document-pdf-engine";

export async function buildCustomerInvoiceDocumentModel(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string
): Promise<DocumentPdfModel | null> {
  const loaded = await getCustomerInvoice(supabase, invoiceId, companyId);
  if (!loaded) return null;
  const { invoice, lines } = loaded;

  const [branding, { data: customer }] = await Promise.all([
    resolveDocumentBranding(companyId),
    invoice.customer_id
      ? supabase.from("vyron_customers").select("*").eq("id", invoice.customer_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null as Record<string, unknown> | null }),
  ]);

  const productIds = Array.from(new Set(lines.map((line) => line.product_id).filter(Boolean))) as string[];
  const productCodeById = new Map<string, string>();
  if (productIds.length) {
    const { data: products } = await supabase.from("vyron_cost_products").select("id, sku").in("id", productIds);
    for (const row of products || []) {
      if (row.sku) productCodeById.set(row.id, String(row.sku));
    }
  }

  return {
    docTitle: "Customer Invoice",
    docNumber: String(invoice.invoice_number),
    branding,
    parties: [
      {
        heading: "Company",
        name: branding.tradingName || branding.companyName,
        lines: [
          branding.address,
          branding.postalAddress ? `Postal: ${branding.postalAddress}` : null,
          [branding.telephone, branding.email].filter(Boolean).join(" | "),
          branding.vatNumber ? `VAT: ${branding.vatNumber}` : null,
        ].filter(Boolean) as string[],
      },
      {
        heading: "Customer",
        name: String(invoice.customer_name || customer?.customer_name || "Customer"),
        lines: [
          customer?.billing_address ? String(customer.billing_address) : null,
          [customer?.email, customer?.phone].filter(Boolean).join(" | "),
          customer?.website ? String(customer.website) : null,
          customer?.vat_number ? `VAT: ${customer.vat_number}` : null,
          customer?.registration_number ? `Reg: ${customer.registration_number}` : null,
          customer?.terms ? `Terms: ${customer.terms}` : null,
        ].filter(Boolean) as string[],
      },
    ],
    meta: [
      { label: "Invoice Number", value: String(invoice.invoice_number) },
      { label: "Status", value: String(invoice.status) },
      { label: "Invoice Date", value: invoice.invoice_date ? String(invoice.invoice_date).slice(0, 10) : "-" },
      { label: "Due Date", value: invoice.due_date ? String(invoice.due_date).slice(0, 10) : "-" },
    ],
    lineColumns: [
      { key: "code", label: "Product Code" },
      { key: "product", label: "Product" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "unitPrice", label: "Unit Price", align: "right" },
      { key: "lineTotal", label: "Line Total", align: "right" },
    ],
    lineRows: lines.map((line) => ({
      code: (line.product_id && productCodeById.get(line.product_id)) || "-",
      product: String(line.product_name),
      qty: Number(line.quantity || 0).toFixed(2),
      unitPrice: Number(line.selling_price || 0).toFixed(2),
      lineTotal: (Number(line.quantity || 0) * Number(line.selling_price || 0)).toFixed(2),
    })),
    totals: {
      subtotal: Number(invoice.sales_value || 0),
      vatAmount: 0,
      grandTotal: Number(invoice.sales_value || 0),
    },
    notes: invoice.notes ? String(invoice.notes) : null,
    authorisation: [
      { label: "Prepared By", value: "" },
      { label: "Approved By", value: "" },
    ],
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
