import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { sessionAuditActor } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { MinimumImportError, applyMinimumUpload, buildMinimumTemplate, previewMinimumUpload, type MinimumKind } from "@/lib/vyron-minimum-level-import";
import { MinimumLevelError } from "@/lib/vyron-stock-minimums";
import { UploadTableError, readUploadedTable } from "@/lib/vyron-upload-table";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { WorkspaceAccessError, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: MinimumKind[] = ["finished_goods", "raw_materials"];
const parseKind = (v: unknown): MinimumKind | null => (KINDS as string[]).includes(String(v)) ? (v as MinimumKind) : null;

function failure(error: unknown, fallback: string) {
  if (error instanceof MinimumImportError || error instanceof MinimumLevelError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof UploadTableError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return workspaceAccessErrorResponse(error, fallback);
}

/** GET ?kind=finished_goods|raw_materials — the section's minimum-level template (.xlsx). Writes nothing. */
export async function GET(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await requireApiCompanyId();
    const kind = parseKind(new URL(request.url).searchParams.get("kind"));
    if (!kind) return NextResponse.json({ ok: false, error: "kind must be finished_goods or raw_materials." }, { status: 400 });
    const { buffer } = await buildMinimumTemplate(supabase, companyId, kind);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="minimum-stock-levels-${kind === "finished_goods" ? "finished-goods" : "raw-materials"}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error, "Template download failed.");
  }
}

/**
 * POST multipart { file (.xlsx or .csv), kind, action: "preview" | "apply" }
 *   preview — validate against this company's stock items; writes nothing (inventory.view).
 *   apply   — re-validate and save every new/changed minimum; refused if any row has an error (inventory.minimums.edit).
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
    const session = await requireWorkspacePermission(action === "apply" ? "inventory.minimums.edit" : "inventory.view");
    const companyId = await requireApiCompanyId();
    const kind = parseKind(form.get("kind"));
    if (!kind) return NextResponse.json({ ok: false, error: "kind must be finished_goods or raw_materials." }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
    const table = await readUploadedTable(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    const isCsv = !/\.xlsx$/i.test(file.name) && !/spreadsheetml/.test(file.type);
    if (action === "apply") {
      const result = await applyMinimumUpload(supabase, companyId, kind, table, isCsv, sessionAuditActor(session), `spreadsheet upload ${file.name.slice(0, 80)} sha256 ${table.sha256.slice(0, 12)}`);
      return NextResponse.json({ ok: true, applied: result.applied, failed: result.failed, ...result.preview });
    }
    return NextResponse.json({ ok: true, ...(await previewMinimumUpload(supabase, companyId, kind, table, isCsv)) });
  } catch (error) {
    return failure(error, "Minimum level upload failed.");
  }
}
