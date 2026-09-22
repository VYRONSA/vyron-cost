import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { OrderEngineError } from "@/lib/order-engine/errors";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { listStandingMappings, revokeStandingMapping } from "@/lib/order-engine/service";

export const runtime = "nodejs";

/** GET /api/order-intake/mappings?includeRevoked=1 — remembered item-code aliases and customer references. */
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    const mappings = await listStandingMappings(supabase, companyId, { includeRevoked: request.nextUrl.searchParams.get("includeRevoked") === "1" });
    return NextResponse.json({ ok: true, mappings });
  } catch (error) {
    return orderErrorResponse(error, "Load mappings failed.");
  }
}

/** POST /api/order-intake/mappings { action: "revoke", kind: "product_alias" | "customer_identity", id } */
export async function POST(request: NextRequest) {
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const body = await readJsonBody(request);
    if (body.action !== "revoke") throw new OrderEngineError("INVALID_INPUT", 'action must be "revoke".');
    const kind = body.kind === "product_alias" || body.kind === "customer_identity" ? body.kind : null;
    if (!kind) throw new OrderEngineError("INVALID_INPUT", "Unknown mapping type.");
    await revokeStandingMapping(supabase, companyId, kind, String(body.id || ""), actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return orderErrorResponse(error, "Revoke mapping failed.");
  }
}
