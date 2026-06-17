import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const CLOSED = new Set(["Closed", "Cancelled", "Fully Received"]);

export async function GET() {
  try {
    await requireWorkspacePermission("purchase_orders.view");
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const companyId = await resolveApiCompanyId();
  if (!companyId) return NextResponse.json({ ok: true, orders: [], purchaseOrders: [] });

  const { data, error } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("id, po_number, supplier_name_snapshot, status, total, expected_total, order_date, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const orders = (data || []).filter((po) => !CLOSED.has(String(po.status || "")));
  return NextResponse.json({ ok: true, orders, purchaseOrders: orders });
}
