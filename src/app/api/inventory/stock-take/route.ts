import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { sessionAuditActor } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { StockTakeError, createStockTakeFromUpload, previewStockTake } from "@/lib/vyron-stock-take-import";
import { stockTakeDateProblem } from "@/lib/vyron-stock-take-rules";
import { readStockTakeFile } from "@/lib/vyron-stock-take-file";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { WorkspaceAccessError, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST multipart { file (Excel .xlsx or CSV — detected from content; header or headerless), action: "preview" | "create", countDate (YYYY-MM-DD, required) }
 *   countDate — the Stock Take Date: the day the physical count was performed (not the upload day).
 *   preview — read, validate and match the count against system stock as at that date; writes nothing.
 *   create  — record it as a stock count awaiting approval (the existing approve → post workflow
 *             posts the adjustments). The same file cannot be loaded twice.
 */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    // Who is asking comes first: no session → 401 before the body is touched (an empty or
    // malformed body from a signed-out caller is still a 401, never a 500).
    // The permission per action is unchanged (preview: inventory.view, create: inventory.counts.create).
    if (!(await getServerWorkspaceSession())) throw new WorkspaceAccessError("Workspace session required.", 401);
    const companyId = await requireApiCompanyId();
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "Upload the stock take file as a form (multipart/form-data) with the file and the Stock Take Date." }, { status: 400 });
    }
    const action = String(form.get("action") || "preview");
    if (action !== "preview" && action !== "create") return NextResponse.json({ ok: false, error: `Unknown action "${action.slice(0, 40)}".` }, { status: 400 });
    const session = await requireWorkspacePermission(action === "create" ? "inventory.counts.create" : "inventory.view");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a stock take file to upload." }, { status: 400 });
    const countDate = String(form.get("countDate") || "").trim();
    const dateProblem = stockTakeDateProblem(countDate);
    if (dateProblem) return NextResponse.json({ ok: false, error: dateProblem }, { status: 400 });
    const table = await readStockTakeFile(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    if (action === "create") {
      const result = await createStockTakeFromUpload(supabase, companyId, { table, sha256: table.sha256, fileName: file.name, countDate }, sessionAuditActor(session));
      return NextResponse.json({ ok: true, count: result.count, file: table.file, ...result.preview });
    }
    return NextResponse.json({ ok: true, file: table.file, ...(await previewStockTake(supabase, companyId, table, { stockTakeDate: countDate })) });
  } catch (error) {
    if (error instanceof StockTakeError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Stock take failed.");
  }
}
