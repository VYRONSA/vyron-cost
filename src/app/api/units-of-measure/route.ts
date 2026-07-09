import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  createUnitOfMeasure,
  listUnitsOfMeasure,
} from "@/lib/vyron-units-of-measure";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("uom.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, units: [] });
    const units = await listUnitsOfMeasure(supabase, companyId);
    return NextResponse.json({ ok: true, units });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List units of measure failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("uom.create");
    const companyId = await requireApiCompanyId();
    const unit = await createUnitOfMeasure(supabase, companyId, {
      code: String(body.code || ""),
      name: String(body.name || ""),
      symbol: body.symbol,
      category: body.category,
      decimal_precision: body.decimal_precision,
      is_active: body.is_active,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, unit });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create unit of measure failed.");
  }
}
