import { NextRequest, NextResponse } from "next/server";
import {
  deleteProductCostLine,
  updateProductCostLine,
} from "@/lib/vyron-cost-product-cost-lines";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

function server() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500, headers: noStore });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: noStore });
  return supabase;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const supabase = server();
  if (supabase instanceof NextResponse) return supabase;
  const { id, lineId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await requireWorkspacePermission("products.edit");
    const companyId = await requireApiCompanyId();
    const line = await updateProductCostLine(supabase, companyId, id, lineId, {
      line_type: body.line_type,
      line_name: body.line_name,
      quantity: body.quantity,
      unit: body.unit,
      unit_cost: body.unit_cost,
      wastage_percent: body.wastage_percent,
    });
    return NextResponse.json({ ok: true, line }, { headers: noStore });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update product cost line failed.");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const supabase = server();
  if (supabase instanceof NextResponse) return supabase;
  const { id, lineId } = await params;
  try {
    await requireWorkspacePermission("products.edit");
    const companyId = await requireApiCompanyId();
    await deleteProductCostLine(supabase, companyId, id, lineId);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete product cost line failed.");
  }
}
