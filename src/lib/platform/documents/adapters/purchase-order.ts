import type { SupabaseClient } from "@supabase/supabase-js";
import { getPurchaseOrderDetail } from "@/lib/vyron-procurement";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderDocumentPdf, type DocumentPdfModel } from "@/lib/platform/documents/vyron-document-pdf-engine";

const STANDARD_PO_TERMS =
  "Standard supplier terms apply. All deliveries must reference PO number. Variances require approval.";

export async function buildPurchaseOrderDocumentModel(
  supabase: SupabaseClient,
  companyId: string,
  poId: string
): Promise<DocumentPdfModel | null> {
  const po = await getPurchaseOrderDetail(supabase, poId, companyId);
  if (!po) return null;

  const [branding, { data: supplier }] = await Promise.all([
    resolveDocumentBranding(companyId),
    po.supplier_id
      ? supabase.from("vyron_cost_suppliers").select("*").eq("id", po.supplier_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null as Record<string, unknown> | null }),
  ]);

  const lineDiscountEstimate = Math.max(0, Number(po.expected_total || 0) - Number(po.total || 0));

  return {
    docTitle: "Purchase Order",
    docNumber: String(po.po_number),
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
        heading: "Supplier",
        name: String(po.supplier_name_snapshot || supplier?.supplier_name || "Supplier"),
        lines: [
          supplier?.physical_address ? String(supplier.physical_address) : null,
          supplier?.postal_address ? `Postal: ${supplier.postal_address}` : null,
          [
            supplier?.contact_email ? String(supplier.contact_email) : supplier?.invoice_email ? String(supplier.invoice_email) : null,
            supplier?.phone ? String(supplier.phone) : null,
          ]
            .filter(Boolean)
            .join(" | "),
          supplier?.website ? String(supplier.website) : null,
          supplier?.vat_number ? `VAT: ${supplier.vat_number}` : null,
          supplier?.registration_number ? `Reg: ${supplier.registration_number}` : null,
          supplier?.payment_terms ? `Terms: ${supplier.payment_terms}` : null,
        ].filter(Boolean) as string[],
      },
    ],
    meta: [
      { label: "PO Number", value: String(po.po_number) },
      { label: "Status", value: String(po.status) },
      { label: "Order Date", value: po.order_date ? String(po.order_date) : "-" },
      {
        label: "Expected Delivery",
        value: (po.lines || []).find((line) => line.expected_delivery_date)?.expected_delivery_date || "-",
      },
    ],
    lineColumns: [
      { key: "item", label: "Line Item" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "unit", label: "Unit" },
      { key: "unitPrice", label: "Unit Price", align: "right" },
      { key: "vatRate", label: "VAT %", align: "right" },
      { key: "vatAmount", label: "VAT", align: "right" },
      { key: "lineTotal", label: "Line Total", align: "right" },
    ],
    lineRows: (po.lines || []).map((line) => ({
      item: String(line.item_name),
      qty: Number(line.quantity || 0).toFixed(4),
      unit: String(line.unit),
      unitPrice: Number(line.unit_price || 0).toFixed(2),
      vatRate: Number(line.vat_rate || 0).toFixed(2),
      vatAmount: Number(line.vat_amount || 0).toFixed(2),
      lineTotal: Number(line.line_total || 0).toFixed(2),
    })),
    totals: {
      subtotal: Number(po.subtotal || 0),
      discountTotal: lineDiscountEstimate,
      vatAmount: Number(po.vat_amount || 0),
      grandTotal: Number(po.total || 0),
    },
    notes: po.notes ? String(po.notes) : null,
    termsAndConditions: branding.termsAndConditions || STANDARD_PO_TERMS,
    authorisation: [
      { label: "Prepared By", value: "" },
      { label: "Approved By", value: "" },
    ],
  };
}

export async function buildPurchaseOrderPdf(
  supabase: SupabaseClient,
  companyId: string,
  poId: string
): Promise<{ bytes: Uint8Array; poNumber: string } | null> {
  const model = await buildPurchaseOrderDocumentModel(supabase, companyId, poId);
  if (!model) return null;
  return { bytes: renderDocumentPdf(model), poNumber: model.docNumber };
}
