import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { SYNC_ACTOR, listActiveConnections, processDueOrders, reconcileDue, runBackfillStep, runningBackfill, syncNow } from "@/lib/store-sales/service";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || "");
  if (secret.length < 16) return false;
  const given = Buffer.from(String(request.headers.get("authorization") || ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * GET /api/integrations/store-sales/cron — the scheduled safety net, every store.
 *
 * Retries what failed (after its back-off), catches up on orders changed since
 * the last catch-up (hourly; this recovers webhooks a store never delivered),
 * and advances a running historical import one page. Protected by CRON_SECRET
 * (Vercel Cron sends it as a bearer token).
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const deadline = Date.now() + 45_000;
  const stores: Array<Record<string, unknown>> = [];
  for (const connection of await listActiveConnections(supabase).catch(() => [])) {
    if (Date.now() > deadline) break;
    const entry: Record<string, unknown> = { channel: connection.channel, store: connection.store_key };
    try {
      entry.processed = await processDueOrders(supabase, connection, { limit: 50, deadline });
      if (reconcileDue(connection) && Date.now() < deadline) entry.catchUp = await syncNow(supabase, connection, SYNC_ACTOR, { deadline });
      const backfill = await runningBackfill(supabase, connection);
      if (backfill && Date.now() < deadline) entry.importPage = (await runBackfillStep(supabase, connection.company_id, backfill.id, { deadline })).backfill.pages;
    } catch (error) {
      // One store's failure never stops the others; it is recorded on that store.
      entry.error = error instanceof Error ? error.message : String(error);
    }
    stores.push(entry);
  }
  return NextResponse.json({ ok: true, stores });
}
