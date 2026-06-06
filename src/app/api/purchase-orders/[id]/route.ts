import { NextRequest, NextResponse } from "next/server";
import { getPurchaseOrderDetail, savePurchaseOrder, transitionPurchaseOrder } from "@/lib/vyron-procurement";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  try {
    const po = await getPurchaseOrderDetail(supabase, id);
    if (!po) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    const [{ data: goodsReceipts }, { data: linkedInvoices }] = await Promise.all([
      supabase
        .from("vyron_cost_goods_receipts")
        .select("id, grn_number, receipt_type, received_at, status")
        .eq("purchase_order_id", id)
        .order("received_at", { ascending: false }),
      supabase
        .from("vyron_documents")
        .select("id, invoice_number, status, total, archived_at")
        .eq("purchase_order_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      ok: true,
      purchaseOrder: po,
      goodsReceipts: goodsReceipts || [],
      linkedInvoices: linkedInvoices || [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Load failed." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    const po = await savePurchaseOrder(
      supabase,
      VYRON_DEFAULT_TENANT_ID,
      {
        id,
        po_number: String(body.po_number || ""),
        supplier_id: body.supplier_id || null,
        supplier_name_snapshot: String(body.supplier_name_snapshot || ""),
        status: body.status || "Draft",
        order_date: body.order_date,
        notes: body.notes,
        lines: Array.isArray(body.lines) ? body.lines : [],
      },
      String(body.actor || "user")
    );
    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Update failed." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "");
  if (!status) return NextResponse.json({ ok: false, error: "status required." }, { status: 400 });
  try {
    const po = await transitionPurchaseOrder(supabase, id, status, {
      approvedBy: body.approvedBy,
      approvalNotes: body.approvalNotes,
      actor: body.actor,
    });
    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Update failed." }, { status: 500 });
  }
}
