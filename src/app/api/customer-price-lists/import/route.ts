import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { importCustomerPriceListRows, type PriceImportRow } from "@/lib/vyron-customer-price-lists";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("admin.imports");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return bad("No active workspace company.");

    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as PriceImportRow[]) : [];
    const fileName = String(body?.fileName || "price-list-import.csv");

    if (!rows.length) return bad("rows are required.");

    const result = await importCustomerPriceListRows(supabase, companyId, {
      fileName,
      rows,
      actor: "user",
      createMissingProducts: Boolean(body?.createMissingProducts),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Price list import failed.");
  }
}
