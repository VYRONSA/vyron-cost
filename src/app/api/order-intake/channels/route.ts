import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { listChannelSettings, saveChannelSettings } from "@/lib/order-engine/settings";

export const runtime = "nodejs";

/** GET /api/order-intake/channels — this company's order channels (web stores). */
export async function GET() {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    return NextResponse.json({ ok: true, channels: await listChannelSettings(supabase, companyId) });
  } catch (error) {
    return orderErrorResponse(error, "Load channels failed.");
  }
}

/**
 * PUT /api/order-intake/channels { channelKey, label, enabled, pricesIncludeTax, eligibleStatuses }
 * A commercial control (a channel decides how its orders are priced and which
 * statuses are fulfilled): approvers only.
 */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const body = await readJsonBody(request);
    const channels = await saveChannelSettings(
      supabase,
      companyId,
      {
        channelKey: String(body.channelKey || ""),
        label: typeof body.label === "string" ? body.label : null,
        enabled: body.enabled === true,
        pricesIncludeTax: typeof body.pricesIncludeTax === "boolean" ? body.pricesIncludeTax : null,
        eligibleStatuses: Array.isArray(body.eligibleStatuses) ? (body.eligibleStatuses as string[]) : null,
      },
      actor
    );
    return NextResponse.json({ ok: true, channels });
  } catch (error) {
    return orderErrorResponse(error, "Save channel failed.");
  }
}
