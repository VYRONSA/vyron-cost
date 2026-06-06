import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

function normalise(row: Record<string, unknown>) {
  const po = row.vyron_cost_purchase_orders as Record<string, unknown> | null | undefined;
  const line = row.vyron_cost_purchase_order_lines as Record<string, unknown> | null | undefined;
  return {
    ...row,
    purchase_order_id: row.purchase_order_id || po?.id || line?.purchase_order_id || "",
    po_number: row.po_number || po?.po_number || "",
    supplier_name_snapshot: row.supplier_name_snapshot || po?.supplier_name_snapshot || "",
    unit: row.unit || line?.unit || "",
    outstanding_qty: Number(row.outstanding_qty ?? line?.outstanding_qty ?? 0),
    item_name: row.item_name || line?.item_name || "Item",
    status: row.status || "Open",
  };
}

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const { data, error } = await supabase
    .from("vyron_cost_back_orders")
    .select("*, vyron_cost_purchase_orders(id, po_number, supplier_name_snapshot), vyron_cost_purchase_order_lines(id, purchase_order_id, item_name, unit, outstanding_qty)")
    .eq("company_id", VYRON_DEFAULT_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!error) return NextResponse.json({ ok: true, backOrders: (data || []).map((r) => normalise(r as Record<string, unknown>)) });

  const { data: fallback, error: fallbackError } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("*, vyron_cost_purchase_orders(id, po_number, supplier_name_snapshot, status, company_id)")
    .gt("outstanding_qty", 0)
    .limit(500);

  if (fallbackError) return NextResponse.json({ ok: false, error: fallbackError.message }, { status: 500 });

  const backOrders = (fallback || [])
    .map((line) => {
      const po = line.vyron_cost_purchase_orders as Record<string, unknown> | null | undefined;
      return {
        id: line.id,
        purchase_order_id: po?.id || line.purchase_order_id,
        purchase_order_line_id: line.id,
        po_number: po?.po_number || "",
        supplier_name_snapshot: po?.supplier_name_snapshot || "",
        item_name: line.item_name,
        unit: line.unit,
        outstanding_qty: Number(line.outstanding_qty || 0),
        status: "Open",
      };
    })
    .filter((row) => row.purchase_order_id);

  return NextResponse.json({ ok: true, backOrders });
}
