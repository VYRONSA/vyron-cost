import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { SalesOrderAdjustmentError, adjustCustomerSalesOrder, type SalesOrderAdjustmentLine } from "@/lib/vyron-customer-sales-orders";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST { lines: [{ id?, productId?, quantity?, discountPct?, remove? }], reason, dryRun? }
 * sales_orders.edit; an Approved order also needs sales_orders.approve. dryRun previews without writing.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("sales_orders.edit");
    const companyId = await requireApiCompanyId();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const lines = Array.isArray(body.lines) ? (body.lines as SalesOrderAdjustmentLine[]).slice(0, 500) : [];
    const result = await adjustCustomerSalesOrder(supabase, companyId, {
      orderId: id,
      lines: lines.map((l) => ({
        id: l.id ? String(l.id) : undefined,
        productId: l.productId ? String(l.productId) : null,
        quantity: l.quantity === undefined ? undefined : Number(l.quantity),
        discountPct: l.discountPct === undefined ? undefined : Number(l.discountPct),
        remove: l.remove === true,
      })),
      reason: String(body.reason || ""),
      actor: await memberDisplayName(supabase, session),
      canAdjustApproved: sessionHasPermission(session, "sales_orders.approve"),
      dryRun: body.dryRun === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SalesOrderAdjustmentError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error && typeof error === "object" && (error as { code?: string }).code === "SALES_ORDER_STOCK_SHORTAGE")
      return NextResponse.json({ ok: false, error: "Not enough stock for the adjusted quantities. Nothing was changed.", shortages: (error as { shortages?: unknown }).shortages || [] }, { status: 409 });
    return workspaceAccessErrorResponse(error, "Order adjustment failed.");
  }
}
