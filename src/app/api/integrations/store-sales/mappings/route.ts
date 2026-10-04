import { NextResponse } from "next/server";
import { orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { storeErrorResponse } from "@/lib/store-sales/http";
import { saveMapping, type MappingInput } from "@/lib/store-sales/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/integrations/store-sales/mappings
 *   { connectionId, kind: "product", key: "variant:<id>" | "variation:<id>" | "product:<id>" | "title:<name>", targetId: <product id> }
 *   { connectionId, kind: "customer", key: "<store customer id>" | "email:<address>", targetId: <customer id> }
 * Records the decision, then retries every order of the store waiting on it.
 */
export async function POST(request: Request) {
  try {
    const { supabase, companyId, actor } = await orderRouteContext("invoices.create");
    const body = await readJsonBody(request);
    const result = await saveMapping(
      supabase,
      companyId,
      {
        connectionId: String(body.connectionId || ""),
        // Validated in saveMapping: anything but "product" or "customer" is refused.
        kind: String(body.kind || "") as MappingInput["kind"],
        key: String(body.key || ""),
        targetId: String(body.targetId || ""),
      },
      actor.userId
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return storeErrorResponse(error, "Save mapping failed.");
  }
}
