import { NextRequest, NextResponse } from "next/server";
import { createProductionRun, listProductionRuns } from "@/lib/vyron-manufacturing";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const status = request.nextUrl.searchParams.get("status") || undefined;
  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    const runs = await listProductionRuns(supabase, VYRON_DEFAULT_TENANT_ID, { status, search });
    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "List failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    const run = await createProductionRun(supabase, VYRON_DEFAULT_TENANT_ID, {
      bom_id: String(body.bom_id || ""),
      product_id: body.product_id || null,
      batch_multiplier: body.batch_multiplier != null ? Number(body.batch_multiplier) : undefined,
      planned_qty: body.planned_qty != null ? Number(body.planned_qty) : undefined,
      notes: body.notes,
      created_by: body.created_by || "user",
      labour: body.labour,
      overhead: body.overhead,
    });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Create failed." }, { status: 500 });
  }
}
