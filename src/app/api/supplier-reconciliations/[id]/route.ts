import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getSupplierReconciliation, reconciliationCsv } from "@/lib/vyron-supplier-reconciliation";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — one reconciliation of this company with its lines; ?format=csv exports the report. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await requireApiCompanyId();
    const { id } = await params;
    const found = await getSupplierReconciliation(supabase, companyId, id);
    if (!found) return NextResponse.json({ ok: false, error: "Reconciliation not found." }, { status: 404 });
    if (new URL(request.url).searchParams.get("format") === "csv") {
      const name = `supplier-reconciliation-${String(found.reconciliation.created_at).slice(0, 10)}.csv`;
      return new NextResponse(reconciliationCsv(found.lines), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: true, ...found }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load reconciliation failed.");
  }
}
