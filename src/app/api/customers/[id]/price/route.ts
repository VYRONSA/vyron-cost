import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { PriceListError } from "@/lib/vyron-customer-price-lists";
import { setCustomerOwnProductPrice } from "@/lib/vyron-customer-own-price";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Set one customer's price for one product: { productId, price }.
 *
 * Changes that customer only — see setCustomerOwnProductPrice. The company is
 * the signed-in member's; the customer and product ids are re-checked against it.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    if (!isSupabaseServiceRoleConfigured()) throw new PriceListError("SUPABASE_SERVICE_ROLE_KEY is required.", 500);
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new PriceListError("Supabase unavailable.", 500);
    const session = await requireWorkspacePermission("sales_orders.edit");
    const companyId = await requireApiCompanyId();
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) || {};
    } catch {
      throw new PriceListError("Invalid request.");
    }
    const result = await setCustomerOwnProductPrice(supabase, companyId, {
      customerId: id,
      productId: String(body.productId || ""),
      price: body.price,
      actor: String(session.userId || "").trim() || "user",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PriceListError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Unable to update the customer's price.");
  }
}
