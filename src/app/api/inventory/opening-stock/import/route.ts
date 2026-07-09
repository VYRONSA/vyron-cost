import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { importOpeningStockRows, type OpeningStockImportRow } from "@/lib/vyron-opening-stock-import";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("inventory.adjustments.post");
    const companyId = await requireApiCompanyId();

    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as OpeningStockImportRow[]) : [];
    const fileName = String(body?.fileName || "opening-stock-import.csv");

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "rows are required." }, { status: 400 });
    }

    const result = await importOpeningStockRows(supabase, companyId, {
      fileName,
      rows,
      actor: "user",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Opening stock import failed.");
  }
}
