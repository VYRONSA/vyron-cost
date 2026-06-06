import { NextRequest, NextResponse } from "next/server";
import { listPurchaseOrders, savePurchaseOrder } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const status = request.nextUrl.searchParams.get("status") || undefined;
  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    const orders = await listPurchaseOrders(supabase, VYRON_DEFAULT_TENANT_ID, { status, search });
    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "List failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  try {
    const po = await savePurchaseOrder(supabase, VYRON_DEFAULT_TENANT_ID, {
      id: body.id,
      po_number: String(body.po_number || `PO-${Date.now().toString().slice(-6)}`),
      supplier_id: body.supplier_id || null,
      supplier_name_snapshot: String(body.supplier_name_snapshot || ""),
      status: body.status || "Draft",
      order_date: body.order_date,
      notes: body.notes,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Save failed." }, { status: 500 });
  }
}
