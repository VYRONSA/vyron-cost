import { NextRequest, NextResponse } from "next/server";
import {
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
    await requireWorkspacePermission("ingredients.view");
    const companyId = await requireApiCompanyId();
    const module = parseModule(body.module);
    const rows = Array.isArray(body.rows) ? (body.rows as Record<string, string>[]) : [];

    if (!module) {
      return NextResponse.json({ ok: false, error: "module is required." }, { status: 400 });
    }
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "rows are required." }, { status: 400 });
    }

    const result = await validateImportCentreRows(supabase, companyId, module, rows);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Import validation failed.");
  }
}
