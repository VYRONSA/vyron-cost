import { NextRequest, NextResponse } from "next/server";
import { listStockItems, syncStockItemsFromMasters } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const entityType = request.nextUrl.searchParams.get("entityType") || undefined;
  const status = request.nextUrl.searchParams.get("status") || undefined;
  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    const items = await listStockItems(supabase, VYRON_DEFAULT_TENANT_ID, { entityType, status, search });
    return NextResponse.json({ ok: true, items });
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
  if (body.action === "sync") {
    try {
      const result = await syncStockItemsFromMasters(supabase, VYRON_DEFAULT_TENANT_ID);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sync failed." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
