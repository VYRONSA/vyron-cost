import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { loadChannelReadiness, setChannelActivation, type ActivationState, type ChannelType } from "@/lib/order-engine/activation";

export const runtime = "nodejs";

/**
 * GET /api/order-intake/activation — every channel's activation state, what it
 * still needs, and what it has done (last success, last failure, exceptions).
 */
export async function GET() {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    return NextResponse.json({ ok: true, channels: await loadChannelReadiness(supabase, companyId) });
  } catch (error) {
    return orderErrorResponse(error, "Load channel activation failed.");
  }
}

/**
 * PUT /api/order-intake/activation { channelType, channelKey?, to, reason?, uatReference? }
 * Activating a channel decides that real customer orders may enter the
 * business through it: approvers only, and the engine still checks the
 * channel's readiness conditions before it allows ACTIVE.
 */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const body = await readJsonBody(request);
    const channels = await setChannelActivation(
      supabase,
      companyId,
      {
        channelType: String(body.channelType || "") as ChannelType,
        channelKey: typeof body.channelKey === "string" ? body.channelKey : null,
        to: String(body.to || "") as ActivationState,
        reason: typeof body.reason === "string" ? body.reason : null,
        uatReference: typeof body.uatReference === "string" ? body.uatReference : null,
      },
      actor
    );
    return NextResponse.json({ ok: true, channels });
  } catch (error) {
    return orderErrorResponse(error, "Change channel activation failed.");
  }
}
