import { NextRequest, NextResponse } from "next/server";
import { validateProductionStock } from "@/lib/vyron-manufacturing";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  manufacturingCompanyContextFromRequest,
  requireManufacturingCompanyId,
} from "@/lib/vyron-manufacturing-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const { id } = await context.params;
  try {
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await requireManufacturingCompanyId(supabase, manufacturingCompanyContextFromRequest(request));
    const { ok: stockOk, shortages } = await validateProductionStock(supabase, companyId, id);
    if (!stockOk && shortages.length === 0) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, stockOk, shortages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Validation failed.");
  }
}
