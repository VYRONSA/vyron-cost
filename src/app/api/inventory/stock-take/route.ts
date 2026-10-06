import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { sessionAuditActor } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { StockTakeError, createStockTakeFromUpload, previewStockTake } from "@/lib/vyron-stock-take-import";
import { UploadTableError, readUploadedTable } from "@/lib/vyron-upload-table";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST multipart { file (CSV/XLSX), action: "preview" | "create", countDate? }
 *   preview — read and match the count against system stock; writes nothing.
 *   create  — record it as a stock count awaiting approval (the existing approve → post workflow
 *             posts the adjustments). The same file cannot be loaded twice.
 */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const form = await request.formData();
    const action = String(form.get("action") || "preview");
    const session = await requireWorkspacePermission(action === "create" ? "inventory.counts.create" : "inventory.view");
    const companyId = await requireApiCompanyId();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a stock take file to upload." }, { status: 400 });
    const table = await readUploadedTable(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    if (action === "create") {
      const countDate = String(form.get("countDate") || "").trim() || null;
      const result = await createStockTakeFromUpload(supabase, companyId, { table, sha256: table.sha256, fileName: file.name, countDate }, sessionAuditActor(session));
      return NextResponse.json({ ok: true, count: result.count, ...result.preview });
    }
    return NextResponse.json({ ok: true, ...(await previewStockTake(supabase, companyId, table)) });
  } catch (error) {
    if (error instanceof UploadTableError || error instanceof StockTakeError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Stock take failed.");
  }
}
