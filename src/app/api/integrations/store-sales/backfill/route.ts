import { NextResponse } from "next/server";
import { orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { StoreSyncError } from "@/lib/store-sales/errors";
import { storeErrorResponse } from "@/lib/store-sales/http";
import { runBackfillStep, setBackfillState, startBackfill } from "@/lib/store-sales/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/integrations/store-sales/backfill
 *   { action: "start", connectionId, from: "YYYY-MM-DD", to?: "YYYY-MM-DD" }
 *   { action: "step", backfillId }      import the next page (also run by the scheduled job)
 *   { action: "pause" | "resume", backfillId }
 */
export async function POST(request: Request) {
  try {
    const { supabase, companyId, actor } = await orderRouteContext("admin.imports");
    const body = await readJsonBody(request);
    const action = String(body.action || "");
    if (action === "start") {
      return NextResponse.json({ ok: true, backfill: await startBackfill(supabase, companyId, { connectionId: String(body.connectionId || ""), from: body.from, to: body.to }, actor.userId) });
    }
    const backfillId = String(body.backfillId || "");
    if (action === "step") return NextResponse.json({ ok: true, ...(await runBackfillStep(supabase, companyId, backfillId, { deadline: Date.now() + 45_000 })) });
    if (action === "pause" || action === "resume") {
      return NextResponse.json({ ok: true, backfill: await setBackfillState(supabase, companyId, backfillId, action === "pause" ? "PAUSED" : "RUNNING", actor.userId) });
    }
    throw new StoreSyncError("INVALID_INPUT", "Unknown action.");
  } catch (error) {
    return storeErrorResponse(error, "Historical import failed.");
  }
}
