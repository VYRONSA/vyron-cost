import { NextRequest, NextResponse } from "next/server";
import {
  createProductCostLine,
  listProductCostLines,
} from "@/lib/vyron-cost-product-cost-lines";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

function serverUnavailable() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500, headers: noStore });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: noStore });
  return supabase;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = serverUnavailable();
  if (supabase instanceof NextResponse) return supabase;
  const { id } = await params;
  try {
    await requireWorkspacePermission("products.view");
    const companyId = await requireApiCompanyId();
    const lines = await listProductCostLines(supabase, companyId, id);
    return NextResponse.json({ ok: true, lines }, { headers: noStore });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List product cost lines failed.");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = serverUnavailable();
  if (supabase instanceof NextResponse) return supabase;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await requireWorkspacePermission("products.edit");
    const companyId = await requireApiCompanyId();
    const line = await createProductCostLine(supabase, companyId, id, {
      line_type: body.line_type,
      line_name: body.line_name,
      quantity: body.quantity,
      unit: body.unit,
      unit_cost: body.unit_cost,
      wastage_percent: body.wastage_percent,
    });
    return NextResponse.json({ ok: true, line }, { headers: noStore });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create product cost line failed.");
  }
}
