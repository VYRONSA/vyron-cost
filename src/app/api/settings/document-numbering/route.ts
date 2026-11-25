import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { configureDocumentSeries, listDocumentSeries } from "@/lib/vyron-document-numbering";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

function admin() {
  if (!isSupabaseServiceRoleConfigured()) return null;
  return getSupabaseAdmin();
}

/** Numbering series and the most recent register entries for this company. */
export async function GET() {
  const supabase = admin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: noStore });
  try {
    await requireWorkspacePermission("invoices.view");
    const companyId = await requireApiCompanyId();
    const series = await listDocumentSeries(supabase, companyId);
    let register: unknown[] = [];
    if (series) {
      const { data, error } = await supabase
        .from("vyron_document_number_register")
        .select("series_key, sequence_value, document_number, document_type, document_id, disposition, issued_by, issued_at, note")
        .eq("company_id", companyId)
        .order("issued_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      register = data || [];
    }
    return NextResponse.json({ ok: true, installed: series !== null, series: series ?? [], register }, { headers: noStore });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Could not load document numbering.");
  }
}

/** Set prefix / starting number — refused once any number has been issued in the series. */
export async function POST(request: NextRequest) {
  const supabase = admin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: noStore });
  const body = await request.json().catch(() => ({}));
  try {
    const session = await requireWorkspacePermission("admin.company");
    const companyId = await requireApiCompanyId();
    const actor = await memberDisplayName(supabase, session);
    const result = await configureDocumentSeries(supabase, companyId, actor, {
      seriesKey: body.seriesKey,
      prefix: body.prefix,
      startAt: body.startAt,
      padding: body.padding,
    });
    await supabase.from("vyron_inventory_audit_log").insert({
      company_id: companyId,
      stock_item_id: null,
      event_type: "document_series_configured",
      actor,
      field_name: result.seriesKey,
      old_value: null,
      new_value: `${result.prefix}${String(result.nextValue).padStart(result.padding, "0")}`,
      detail: `Numbering series ${result.seriesKey} set to start at ${result.prefix}${String(result.nextValue).padStart(result.padding, "0")} (before any number was issued).`,
      reference_type: "document_series",
      reference_id: null,
      metadata: { ...result, at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, result }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && /already been issued|prefix must|starting number|Unknown numbering/.test(error.message)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409, headers: noStore });
    }
    return workspaceAccessErrorResponse(error, "Could not save the numbering series.");
  }
}
