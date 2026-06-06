import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

const CLOSED = new Set(["Closed", "Cancelled", "Fully Received"]);

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const { data, error } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id, po_number, supplier_name_snapshot, status, total, expected_total, order_date, created_at")
    .eq("company_id", VYRON_DEFAULT_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const orders = (data || []).filter((po) => !CLOSED.has(String(po.status || "")));
  return NextResponse.json({ ok: true, orders, purchaseOrders: orders });
}
