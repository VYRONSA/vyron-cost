import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerSalesOrder } from "@/lib/vyron-customer-sales-orders";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderDocumentPdf, type DocumentPdfModel } from "@/lib/platform/documents/vyron-document-pdf-engine";

export async function buildSalesOrderDocumentModel(
  supabase: SupabaseClient,
  companyId: string,
  salesOrderId: string
): Promise<DocumentPdfModel | null> {
  const loaded = await getCustomerSalesOrder(supabase, companyId, salesOrderId);
  if (!loaded) return null;
  const { order, lines } = loaded;

  const [branding, { data: customer }] = await Promise.all([
    resolveDocumentBranding(companyId),
    order.customer_id
      ? supabase.from("vyron_customers").select("*").eq("id", order.customer_id).eq("company_id", companyId).maybeSingle()
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

  const vatByRate = new Map<string, { base: number; vat: number }>();
  for (const line of lines) {
    const net = Number(line.quantity || 0) * Number(line.selling_price || 0) * (1 - Number(line.discount_pct || 0) / 100);
    const rateKey = `${Number(line.tax_rate ?? 15).toFixed(2)}%`;
    const entry = vatByRate.get(rateKey) || { base: 0, vat: 0 };
    entry.base += net;
    entry.vat += net * (Number(line.tax_rate ?? 15) / 100);
    vatByRate.set(rateKey, entry);
  }

  return {
    docTitle: "Sales Order",
    docNumber: String(order.order_number),
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
        name: String(order.customer_name || customer?.customer_name || "Customer"),
        lines: [
          customer?.billing_address ? `Billing: ${customer.billing_address}` : null,
          order.delivery_address ? `Delivery: ${order.delivery_address}` : null,
          [customer?.email, customer?.phone].filter(Boolean).join(" | "),
          customer?.website ? String(customer.website) : null,
          customer?.vat_number ? `VAT: ${customer.vat_number}` : null,
          customer?.registration_number ? `Reg: ${customer.registration_number}` : null,
          customer?.terms ? `Terms: ${customer.terms}` : null,
        ].filter(Boolean) as string[],
      },
    ],
    meta: [
      { label: "Order Number", value: String(order.order_number) },
      { label: "Status", value: String(order.status) },
      { label: "Requested Delivery", value: order.requested_delivery_date ? String(order.requested_delivery_date).slice(0, 10) : "-" },
      { label: "Warehouse", value: order.warehouse || "-" },
      { label: "Salesperson", value: order.salesperson || "-" },
      { label: "Contact", value: order.contact_name || "-" },
    ],
    lineColumns: [
      { key: "code", label: "Product Code" },
      { key: "description", label: "Description" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "unit", label: "Unit" },
      { key: "price", label: "Unit Price", align: "right" },
      { key: "discount", label: "Disc %", align: "right" },
      { key: "taxRate", label: "Tax %", align: "right" },
      { key: "lineTotal", label: "Line Total", align: "right" },
    ],
    lineRows: lines.map((line) => ({
      code: (line.product_id && productCodeById.get(line.product_id)) || "-",
      description: String(line.description),
      qty: Number(line.quantity || 0).toFixed(2),
      unit: String(line.unit),
      price: Number(line.selling_price || 0).toFixed(2),
      discount: Number(line.discount_pct || 0).toFixed(2),
      taxRate: Number(line.tax_rate ?? 15).toFixed(2),
      lineTotal: Number(line.line_total || 0).toFixed(2),
    })),
    totals: {
      subtotal: Number(order.subtotal || 0),
      vatAmount: Number(order.vat_amount || 0),
      vatSummary: Array.from(vatByRate.entries()).map(([rate, value]) => ({ rate, base: value.base, vat: value.vat })),
      grandTotal: Number(order.total || 0),
    },
    notes: order.notes ? String(order.notes) : null,
    authorisation: [
      { label: "Prepared By", value: order.salesperson || "" },
      { label: "Approved By", value: "" },
    ],
  };
}

export async function buildSalesOrderPdf(
  supabase: SupabaseClient,
  companyId: string,
  salesOrderId: string
): Promise<{ bytes: Uint8Array; orderNumber: string } | null> {
  const model = await buildSalesOrderDocumentModel(supabase, companyId, salesOrderId);
  if (!model) return null;
  return { bytes: renderDocumentPdf(model), orderNumber: model.docNumber };
}
