import { NextRequest, NextResponse } from "next/server";
import { createReplenishmentPoFromAlert } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  if (!body.alertId) return NextResponse.json({ ok: false, error: "alertId is required." }, { status: 400 });
  try {
    const po = await createReplenishmentPoFromAlert(supabase, VYRON_DEFAULT_TENANT_ID, String(body.alertId), String(body.actor || "user"));
    return NextResponse.json({ ok: true, po });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PO creation failed." }, { status: 500 });
  }
}
