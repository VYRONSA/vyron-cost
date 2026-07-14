import type { SupabaseClient } from "@supabase/supabase-js";
import { getStockCountForCompany } from "@/lib/vyron-inventory";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderDocumentPdf, type DocumentPdfModel } from "@/lib/platform/documents/vyron-document-pdf-engine";

type StockCountLineRow = {
  system_qty: number | null;
  counted_qty: number | null;
  variance_qty: number | null;
  vyron_cost_stock_items: { item_code: string; description: string; unit: string } | null;
};

export async function buildStockCountDocumentModel(
  supabase: SupabaseClient,
  companyId: string,
  countId: string
): Promise<DocumentPdfModel | null> {
  const count = await getStockCountForCompany(supabase, companyId, countId).catch(() => null) as
    | Record<string, unknown>
    | null;
  if (!count) return null;

  const [branding, { data: lines }] = await Promise.all([
    resolveDocumentBranding(companyId),
    supabase
      .from("vyron_cost_stock_count_lines")
      .select("system_qty,counted_qty,variance_qty,vyron_cost_stock_items(item_code,description,unit)")
      .eq("stock_count_id", countId)
      .eq("company_id", companyId)
      .order("created_at"),
  ]);

  const countLines = (lines || []) as unknown as StockCountLineRow[];

  return {
    docTitle: "Stock Count Sheet",
    docNumber: String(count.count_number || countId),
    branding,
    parties: [
      {
        heading: "Company",
        name: branding.tradingName || branding.companyName,
        lines: [branding.address, branding.postalAddress ? `Postal: ${branding.postalAddress}` : null].filter(Boolean) as string[],
      },
    ],
    meta: [
      { label: "Count Number", value: String(count.count_number || "-") },
      { label: "Count Type", value: String(count.count_type || "-") },
      { label: "Status", value: String(count.status || "-") },
      { label: "Created By", value: count.created_by ? String(count.created_by) : "-" },
      { label: "Approved By", value: count.approved_by ? String(count.approved_by) : "-" },
      { label: "Variance Value", value: Number(count.variance_value_total || 0).toFixed(2) },
    ],
    lineColumns: [
      { key: "code", label: "Item Code" },
      { key: "description", label: "Description" },
      { key: "unit", label: "Unit" },
      { key: "system", label: "System Qty", align: "right" },
      { key: "counted", label: "Counted Qty", align: "right" },
      { key: "variance", label: "Variance", align: "right" },
    ],
    lineRows: countLines.map((line) => ({
      code: line.vyron_cost_stock_items?.item_code || "-",
      description: line.vyron_cost_stock_items?.description || "-",
      unit: line.vyron_cost_stock_items?.unit || "-",
      system: Number(line.system_qty || 0).toFixed(4),
      counted: Number(line.counted_qty || 0).toFixed(4),
      variance: Number(line.variance_qty || 0).toFixed(4),
    })),
    notes: count.notes ? String(count.notes) : null,
    authorisation: [
      { label: "Counted By", value: count.created_by ? String(count.created_by) : "" },
      { label: "Approved By", value: count.approved_by ? String(count.approved_by) : "" },
    ],
  };
}

export async function buildStockCountPdf(
  supabase: SupabaseClient,
  companyId: string,
  countId: string
): Promise<{ bytes: Uint8Array; countNumber: string } | null> {
  const model = await buildStockCountDocumentModel(supabase, companyId, countId);
  if (!model) return null;
  return { bytes: renderDocumentPdf(model), countNumber: model.docNumber };
}
