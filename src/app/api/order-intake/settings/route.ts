import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { namesFor } from "@/lib/order-engine/names";
import { loadOrderSettings, saveOrderSettings } from "@/lib/order-engine/settings";

export const runtime = "nodejs";

/** GET /api/order-intake/settings — this company's ordering settings (defaults when none are saved). */
export async function GET() {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    const settings = await loadOrderSettings(supabase, companyId);
    const names = await namesFor(supabase, companyId, { customers: [settings.b2cCustomerId] });
    return NextResponse.json({
      ok: true,
      settings: { ...settings, b2cCustomerName: settings.b2cCustomerId ? names.customers.get(settings.b2cCustomerId) ?? null : null },
    });
  } catch (error) {
    return orderErrorResponse(error, "Load ordering settings failed.");
  }
}

/**
 * PUT /api/order-intake/settings { b2cCustomerId, productNameMatching, duplicatePoAction, minLeadTimeDays }
 * Ordering settings are a commercial control: approvers only. Always this company.
 */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const body = await readJsonBody(request);
    const settings = await saveOrderSettings(
      supabase,
      companyId,
      {
        b2cCustomerId: body.b2cCustomerId ? String(body.b2cCustomerId) : null,
        productNameMatching: typeof body.productNameMatching === "string" ? body.productNameMatching : undefined,
        duplicatePoAction: typeof body.duplicatePoAction === "string" ? body.duplicatePoAction : undefined,
        minLeadTimeDays: body.minLeadTimeDays as number | string | null,
      },
      actor
    );
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return orderErrorResponse(error, "Save ordering settings failed.");
  }
}
