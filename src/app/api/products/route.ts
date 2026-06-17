import { NextRequest, NextResponse } from "next/server";
import { createProduct, listProducts } from "@/lib/vyron-cost-master-data";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
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
    await requireWorkspacePermission("products.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, products: [] });
    const products = await listProducts(supabase, companyId);
    return NextResponse.json({ ok: true, products });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List failed.");
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
    await requireWorkspacePermission("products.create");
    const companyId = await requireApiCompanyId();
    const product = await createProduct(supabase, companyId, {
      product_name: String(body.product_name || ""),
      product_category: body.product_category || body.category,
      linked_bom_id: body.linked_bom_id,
      selling_price: body.selling_price,
      total_cost: body.total_cost,
      target_gp: body.target_gp,
      product_status: body.product_status,
    });
    return NextResponse.json({ ok: true, product });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
