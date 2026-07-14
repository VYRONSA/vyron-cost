import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductionRun } from "@/lib/vyron-manufacturing";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderDocumentPdf, type DocumentPdfModel } from "@/lib/platform/documents/vyron-document-pdf-engine";

export async function buildProductionRunDocumentModel(
  supabase: SupabaseClient,
  companyId: string,
  runId: string
): Promise<DocumentPdfModel | null> {
  const run = await getProductionRun(supabase, runId, companyId);
  if (!run) return null;

  const branding = await resolveDocumentBranding(companyId);

  return {
    docTitle: "Manufacturing Batch",
    docNumber: String(run.run_number),
    branding,
    parties: [
      {
        heading: "Company",
        name: branding.tradingName || branding.companyName,
        lines: [branding.address, branding.postalAddress ? `Postal: ${branding.postalAddress}` : null].filter(Boolean) as string[],
      },
      {
        heading: "Product",
        name: run.product_name_snapshot || run.bom_name_snapshot,
        lines: [`BOM: ${run.bom_name_snapshot}`],
      },
    ],
    meta: [
      { label: "Run Number", value: String(run.run_number) },
      { label: "Status", value: String(run.status) },
      { label: "Planned Qty", value: Number(run.planned_qty || 0).toFixed(2) },
      { label: "Actual Qty", value: Number(run.actual_qty || 0).toFixed(2) },
      { label: "Yield %", value: Number(run.yield_pct || 0).toFixed(2) },
      { label: "Started", value: run.started_at ? String(run.started_at).slice(0, 10) : "-" },
      { label: "Completed", value: run.completed_at ? String(run.completed_at).slice(0, 10) : "-" },
      { label: "Cost / Unit", value: Number(run.cost_per_unit || 0).toFixed(2) },
    ],
    lineColumns: [
      { key: "line", label: "Line" },
      { key: "type", label: "Type" },
      { key: "unit", label: "Unit" },
      { key: "planned", label: "Planned Qty", align: "right" },
      { key: "actual", label: "Actual Qty", align: "right" },
      { key: "actualValue", label: "Actual Value", align: "right" },
    ],
    lineRows: (run.lines || []).map((line) => ({
      line: String(line.line_name),
      type: String(line.line_type),
      unit: String(line.unit),
      planned: Number(line.planned_qty || 0).toFixed(4),
      actual: Number(line.actual_qty || 0).toFixed(4),
      actualValue: Number(line.actual_value || 0).toFixed(2),
    })),
    totals: {
      subtotal: Number(run.total_production_cost || 0),
      vatAmount: 0,
      grandTotal: Number(run.actual_cost || run.total_production_cost || 0),
    },
    notes: run.notes ? String(run.notes) : null,
    authorisation: [
      { label: "Started By", value: run.started_by || "" },
      { label: "Completed By", value: run.completed_by || "" },
      { label: "Approved By", value: run.approved_by || "" },
    ],
  };
}

export async function buildProductionRunPdf(
  supabase: SupabaseClient,
  companyId: string,
  runId: string
): Promise<{ bytes: Uint8Array; runNumber: string } | null> {
  const model = await buildProductionRunDocumentModel(supabase, companyId, runId);
  if (!model) return null;
  return { bytes: renderDocumentPdf(model), runNumber: model.docNumber };
}
