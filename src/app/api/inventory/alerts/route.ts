import { NextResponse } from "next/server";
import { getOverstockItems, getSlowMovingItems } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const [{ data: lowStock }, slow30, slow60, slow90, overstock] = await Promise.all([
      supabase
        .from("vyron_cost_low_stock_alerts")
        .select("*, vyron_cost_stock_items(item_code, description, qty_on_hand, unit)")
        .eq("company_id", VYRON_DEFAULT_TENANT_ID)
        .eq("status", "Open"),
      getSlowMovingItems(supabase, VYRON_DEFAULT_TENANT_ID, 30),
      getSlowMovingItems(supabase, VYRON_DEFAULT_TENANT_ID, 60),
      getSlowMovingItems(supabase, VYRON_DEFAULT_TENANT_ID, 90),
      getOverstockItems(supabase, VYRON_DEFAULT_TENANT_ID),
    ]);
    return NextResponse.json({
      ok: true,
      lowStockAlerts: lowStock || [],
      slowMoving30: slow30,
      slowMoving60: slow60,
      slowMoving90: slow90,
      overstock,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Alerts failed." }, { status: 500 });
  }
}
