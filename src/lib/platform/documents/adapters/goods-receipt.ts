import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderDocumentPdf, type DocumentPdfModel } from "@/lib/platform/documents/vyron-document-pdf-engine";

type GrnLineRow = {
  item_name: string;
  unit: string;
  ordered_qty: number | null;
  received_qty: number | null;
  damaged_qty: number | null;
  rejected_qty: number | null;
};

export async function buildGoodsReceiptDocumentModel(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string
): Promise<DocumentPdfModel | null> {
  const { data: grn } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("*, vyron_cost_purchase_orders(id, po_number, supplier_name_snapshot)")
    .eq("id", grnId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!grn) return null;

  const [branding, { data: lines }, { data: supplier }] = await Promise.all([
    resolveDocumentBranding(companyId),
    supabase
      .from("vyron_cost_goods_receipt_lines")
      .select("item_name,unit,ordered_qty,received_qty,damaged_qty,rejected_qty")
      .eq("goods_receipt_id", grnId)
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true }),
    grn.supplier_id
      ? supabase.from("vyron_cost_suppliers").select("*").eq("id", grn.supplier_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null as Record<string, unknown> | null }),
  ]);

  const grnLines = (lines || []) as GrnLineRow[];
  const po = (
    grn as { vyron_cost_purchase_orders?: { po_number?: string; supplier_name_snapshot?: string } | null }
  ).vyron_cost_purchase_orders;

  const totalsSummary = grnLines.reduce(
    (acc, line) => {
      acc.ordered += Number(line.ordered_qty || 0);
      acc.received += Number(line.received_qty || 0);
      acc.damaged += Number(line.damaged_qty || 0);
      acc.rejected += Number(line.rejected_qty || 0);
      return acc;
    },
    { ordered: 0, received: 0, damaged: 0, rejected: 0 }
  );

  return {
    docTitle: "Goods Receipt Note",
    docNumber: String(grn.grn_number || grnId),
    branding,
    parties: [
      {
        heading: "Company",
        name: branding.tradingName || branding.companyName,
        lines: [branding.address, branding.postalAddress ? `Postal: ${branding.postalAddress}` : null].filter(Boolean) as string[],
      },
      {
        heading: "Supplier",
        name: String(grn.supplier_name_snapshot || po?.supplier_name_snapshot || "Supplier"),
        lines: [
          supplier?.physical_address ? String(supplier.physical_address) : null,
          supplier?.postal_address ? `Postal: ${supplier.postal_address}` : null,
          [supplier?.contact_email, supplier?.phone].filter(Boolean).join(" | "),
          supplier?.website ? String(supplier.website) : null,
          supplier?.vat_number ? `VAT: ${supplier.vat_number}` : null,
          supplier?.registration_number ? `Reg: ${supplier.registration_number}` : null,
        ].filter(Boolean) as string[],
      },
    ],
    meta: [
      { label: "GRN Number", value: String(grn.grn_number || "-") },
      { label: "Purchase Order", value: po?.po_number ? String(po.po_number) : "-" },
      { label: "Status", value: String(grn.status || "-") },
      { label: "Received By", value: grn.received_by ? String(grn.received_by) : "-" },
      { label: "Total Ordered", value: totalsSummary.ordered.toFixed(2) },
      { label: "Total Received", value: totalsSummary.received.toFixed(2) },
      { label: "Total Damaged", value: totalsSummary.damaged.toFixed(2) },
      { label: "Total Rejected", value: totalsSummary.rejected.toFixed(2) },
    ],
    lineColumns: [
      { key: "item", label: "Line Item" },
      { key: "unit", label: "Unit" },
      { key: "ordered", label: "Ordered", align: "right" },
      { key: "received", label: "Received", align: "right" },
      { key: "damaged", label: "Damaged", align: "right" },
      { key: "rejected", label: "Rejected", align: "right" },
    ],
    lineRows: grnLines.map((line) => ({
      item: String(line.item_name),
      unit: String(line.unit),
      ordered: Number(line.ordered_qty || 0).toFixed(4),
      received: Number(line.received_qty || 0).toFixed(4),
      damaged: Number(line.damaged_qty || 0).toFixed(4),
      rejected: Number(line.rejected_qty || 0).toFixed(4),
    })),
    notes: grn.notes ? String(grn.notes) : null,
    authorisation: [
      { label: "Received By", value: grn.received_by ? String(grn.received_by) : "" },
      { label: "Approved By", value: "" },
    ],
  };
}

export async function buildGoodsReceiptPdf(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string
): Promise<{ bytes: Uint8Array; grnNumber: string } | null> {
  const model = await buildGoodsReceiptDocumentModel(supabase, companyId, grnId);
  if (!model) return null;
  return { bytes: renderDocumentPdf(model), grnNumber: model.docNumber };
}
