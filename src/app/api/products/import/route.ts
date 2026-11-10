import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { FinishedGoodsImportError, applyFinishedGoodsImport, buildFinishedGoodsImportTemplate, previewFinishedGoodsImport } from "@/lib/vyron-finished-goods-import";
import { UploadTableError, readUploadedTable } from "@/lib/vyron-upload-table";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { WorkspaceAccessError, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function failure(error: unknown, fallback: string) {
  if (error instanceof FinishedGoodsImportError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof UploadTableError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return workspaceAccessErrorResponse(error, fallback);
}

/** GET — the Finished Goods import template (.xlsx) with this company's coded products. Writes nothing. */
export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("products.view");
    const companyId = await requireApiCompanyId();
    const buffer = await buildFinishedGoodsImportTemplate(supabase, companyId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="finished-goods-import-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error, "Template download failed.");
  }
}

/**
 * POST multipart { file, action: "preview" | "apply", createNew: "true" | "false" }
 *   preview — products.view; writes nothing.
 *   apply   — updates need products.edit, new products need products.create (and createNew=true).
 */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    if (!(await getServerWorkspaceSession())) throw new WorkspaceAccessError("Workspace session required.", 401);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "Upload the file as multipart/form-data." }, { status: 400 });
    }
    const action = String(form.get("action") || "preview");
    if (action !== "preview" && action !== "apply") return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    const session = await requireWorkspacePermission("products.view");
    if (action === "apply" && !sessionHasPermission(session, "products.edit") && !sessionHasPermission(session, "products.create"))
      throw new WorkspaceAccessError("Access denied.", 403);
    const companyId = await requireApiCompanyId();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
    const table = await readUploadedTable(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    const isCsv = !/\.xlsx$/i.test(file.name) && !/spreadsheetml/.test(file.type);
    if (action === "apply") {
      const result = await applyFinishedGoodsImport(supabase, companyId, table, isCsv, {
        createNew: String(form.get("createNew")) === "true",
        canCreate: sessionHasPermission(session, "products.create"),
        canEdit: sessionHasPermission(session, "products.edit"),
        actor: await memberDisplayName(supabase, session),
        source: `finished goods import ${file.name.slice(0, 80)} sha256 ${table.sha256.slice(0, 12)}`,
      });
      return NextResponse.json({ ok: true, created: result.created, updated: result.updated, notCreated: result.notCreated, failed: result.failed, ...result.preview });
    }
    return NextResponse.json({ ok: true, ...(await previewFinishedGoodsImport(supabase, companyId, table, isCsv)) });
  } catch (error) {
    return failure(error, "Finished goods import failed.");
  }
}
