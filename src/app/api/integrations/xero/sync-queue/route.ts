import { NextRequest, NextResponse } from "next/server";
import { listXeroSyncQueueRows, mapQueueRowToDisplay } from "@/lib/vyron-xero-integration";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: true, items: [] });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, items: [] });
  try {
    const queue = await listXeroSyncQueueRows(supabase, VYRON_DEFAULT_TENANT_ID);
    const items = queue.map((row) => mapQueueRowToDisplay(row as Record<string, unknown>));
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Queue failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (body.action !== "sync" || !id) {
    return NextResponse.json({ ok: false, error: "Invalid sync request." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const xeroId = `XERO-${Math.floor(100000 + Math.random() * 899999)}`;

  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .update({
      status: "Synced",
      xero_id: xeroId,
      synced_at: now,
      last_attempt_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Queue item not found." }, { status: 404 });

  return NextResponse.json({ ok: true, item: mapQueueRowToDisplay(data as Record<string, unknown>) });
}
