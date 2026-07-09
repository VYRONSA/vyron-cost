import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { resolveCustomerProductPrice } from "@/lib/vyron-customer-price-lists";
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
    await requireWorkspacePermission("sales_orders.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return bad("No active workspace company.");

    const body = await request.json();
    const productId = String(body?.productId || "").trim();
    const customerId = body?.customerId ? String(body.customerId) : null;
    const asOfDate = body?.asOfDate ? String(body.asOfDate) : undefined;

    if (!productId) return bad("productId is required.");

    const resolved = await resolveCustomerProductPrice(supabase, companyId, {
      customerId,
      productId,
      asOfDate,
    });

    return NextResponse.json({ ok: true, resolved });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Unable to resolve price.");
  }
}
