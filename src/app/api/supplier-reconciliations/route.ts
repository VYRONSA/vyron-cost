import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { sessionAuditActor } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { ReconciliationError, listSupplierReconciliations, runSupplierReconciliation } from "@/lib/vyron-supplier-reconciliation";
import { UploadTableError, readUploadedTable } from "@/lib/vyron-upload-table";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — this company's reconciliation runs, newest first. */
export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await requireApiCompanyId();
    return NextResponse.json({ ok: true, reconciliations: await listSupplierReconciliations(supabase, companyId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load reconciliations failed.");
  }
}

/** POST multipart { file (CSV/XLSX), supplierName? } — reconcile a supplier statement / invoice list. Posts nothing to the books. */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("suppliers.edit");
    const companyId = await requireApiCompanyId();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a supplier statement or invoice list to upload." }, { status: 400 });
    const table = await readUploadedTable(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    const supplierName = String(form.get("supplierName") || "").trim() || null;
    const result = await runSupplierReconciliation(supabase, companyId, { table, sha256: table.sha256, fileName: file.name, supplierName }, sessionAuditActor(session));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof UploadTableError || error instanceof ReconciliationError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Reconciliation failed.");
  }
}
