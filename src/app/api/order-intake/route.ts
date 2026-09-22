import { NextRequest, NextResponse } from "next/server";
import { csvOrderAdapter } from "@/lib/order-engine/adapters/csv";
import { manualOrderAdapter } from "@/lib/order-engine/adapters/manual";
import { OrderSourceParseError } from "@/lib/order-engine/adapters/types";
import { OrderEngineError } from "@/lib/order-engine/errors";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { listIntakes, receiveOrderCandidate, type IntakeListView } from "@/lib/order-engine/service";

export const runtime = "nodejs";

/** GET /api/order-intake?view=inbox|approvals|exceptions|done|all */
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    const view = (request.nextUrl.searchParams.get("view") || "inbox") as IntakeListView;
    const result = await listIntakes(supabase, companyId, { view });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return orderErrorResponse(error, "List orders failed.");
  }
}

/**
 * POST /api/order-intake
 *   { kind: "manual", customerId?, customerName?, customerPoNumber?, requestedDeliveryDate?, notes?, idempotencyKey?, lines: [...] }
 *   { kind: "csv", text, fileName? }
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, companyId, actor } = await orderRouteContext("sales_orders.create");
    const body = await readJsonBody(request);
    let candidate;
    try {
      if (body.kind === "csv") {
        candidate = csvOrderAdapter.normalize({ text: String(body.text ?? ""), fileName: typeof body.fileName === "string" ? body.fileName : null });
      } else if (body.kind === "manual") {
        candidate = manualOrderAdapter.normalize(body);
      } else {
        throw new OrderEngineError("INVALID_INPUT", 'kind must be "manual" or "csv".');
      }
    } catch (error) {
      if (error instanceof OrderSourceParseError) throw new OrderEngineError("INVALID_INPUT", error.message);
      throw error;
    }
    const result = await receiveOrderCandidate(supabase, companyId, candidate, actor);
    return NextResponse.json(
      { ok: true, duplicate: result.duplicate, intake: result.intake, lines: result.lines },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    return orderErrorResponse(error, "Receive order failed.");
  }
}
