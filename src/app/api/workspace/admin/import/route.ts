import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { persistImportRows } from "@/lib/vyron-import-persist";
import type { ImportEntityType } from "@/lib/vyron-import-centre";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession("admin.imports");
    const companyId = await requireApiCompanyId();
    if (!isSupabaseServiceRoleConfigured()) {
      return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 500 });
    }
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

    const body = (await request.json()) as {
      entity: ImportEntityType;
      rows: Record<string, string>[];
      fileName?: string;
    };

    if (!body.entity || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Entity and rows are required." }, { status: 400 });
    }

    const result = await persistImportRows(supabase, companyId, body.entity, body.rows);

    await supabase.from("vyron_import_runs").insert({
      company_id: companyId,
      entity_type: body.entity,
      file_name: body.fileName || `${body.entity}.csv`,
      valid_rows: result.imported,
      rejected_rows: result.skipped,
      status: result.errors.length ? "Partial" : "Completed",
      error_report: result.errors.slice(0, 50),
    }).then(() => undefined, () => undefined);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Import failed." },
      { status: error instanceof Error && error.message.includes("required") ? 403 : 400 }
    );
  }
}
