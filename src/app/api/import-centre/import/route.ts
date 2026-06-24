import { NextRequest, NextResponse } from "next/server";
import {
  importImportCentreRows,
  type ImportCentreModule,
  validateImportCentreRows,
} from "@/lib/vyron-import-centre-v1";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

function parseModule(value: unknown): ImportCentreModule | null {
  if (value === "raw-materials" || value === "finished-goods" || value === "boms") return value;
  return null;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("admin.imports");
    const companyId = await requireApiCompanyId();
    const module = parseModule(body.module);
    const rows = Array.isArray(body.rows) ? (body.rows as Record<string, string>[]) : [];
    const createMissingMaterials = Boolean(body.createMissingMaterials);
    const fileName = String(body.fileName || `${module || "import"}.csv`);

    if (!module) {
      return NextResponse.json({ ok: false, error: "module is required." }, { status: 400 });
    }
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "rows are required." }, { status: 400 });
    }

    const validation = await validateImportCentreRows(supabase, companyId, module, rows);
    if (!validation.validRows.length) {
      return NextResponse.json({
        ok: false,
        error: "No valid rows to import.",
        ...validation,
      });
    }

    if (
      module === "boms" &&
      validation.missingFinishedGoods?.length &&
      validation.missingFinishedGoods.length > 0
    ) {
      return NextResponse.json({
        ok: false,
        error: "Import blocked until finished goods exist for all BOM headers.",
        ...validation,
      });
    }

    if (
      module === "boms" &&
      validation.missingIngredients?.length &&
      !createMissingMaterials
    ) {
      return NextResponse.json({
        ok: false,
        error: "Missing raw materials detected. Enable create missing materials or import materials first.",
        ...validation,
      });
    }

    const result = await importImportCentreRows(supabase, companyId, module, validation.validRows, {
      createMissingMaterials,
    });

    await supabase
      .from("vyron_import_runs")
      .insert({
        company_id: companyId,
        entity_type: module,
        file_name: fileName,
        valid_rows: result.imported,
        rejected_rows: result.skipped,
        status: result.errors.length ? "Partial" : "Completed",
        error_report: result.errors.slice(0, 50),
      })
      .then(() => undefined, () => undefined);

    return NextResponse.json({ ok: true, ...result, validation });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Import failed.");
  }
}
