import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { writeProcurementAudit } from "@/lib/vyron-procurement";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const { data: grn, error } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("*, vyron_cost_purchase_orders(id, po_number, supplier_name_snapshot)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!grn) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const { data: lines } = await supabase
    .from("vyron_cost_goods_receipt_lines")
    .select("*")
    .eq("goods_receipt_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json({ ok: true, receipt: { ...grn, lines: lines || [] } });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const lines = Array.isArray(body.lines) ? body.lines : [];

  const { data: grn, error: grnLoadError } = await supabase
    .from("vyron_cost_goods_receipts")
    .select("id, company_id, purchase_order_id, grn_number")
    .eq("id", id)
    .maybeSingle();

  if (grnLoadError) return NextResponse.json({ ok: false, error: grnLoadError.message }, { status: 500 });
  if (!grn) return NextResponse.json({ ok: false, error: "GRN not found." }, { status: 404 });

  const { error: headerError } = await supabase
    .from("vyron_cost_goods_receipts")
    .update({
      status: String(body.status || "Posted"),
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (headerError) return NextResponse.json({ ok: false, error: headerError.message }, { status: 500 });

  for (const line of lines) {
    const receivedQty = Number(line.received_qty || 0);
    const damagedQty = Number(line.damaged_qty || 0);
    const rejectedQty = Number(line.rejected_qty || 0);
    const orderedQty = Number(line.ordered_qty || 0);
    const outstandingQty = Math.max(0, orderedQty - receivedQty - damagedQty - rejectedQty);

    if (!line.id) continue;
    const { error: lineError } = await supabase
      .from("vyron_cost_goods_receipt_lines")
      .update({
        received_qty: receivedQty,
        damaged_qty: damagedQty,
        rejected_qty: rejectedQty,
        outstanding_qty: outstandingQty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);
    if (lineError) return NextResponse.json({ ok: false, error: lineError.message }, { status: 500 });
  }

  const { data: receiptLines } = await supabase
    .from("vyron_cost_goods_receipt_lines")
    .select("purchase_order_line_id")
    .eq("goods_receipt_id", id)
    .not("purchase_order_line_id", "is", null);

  const poLineIds = Array.from(new Set((receiptLines || []).map((row) => String(row.purchase_order_line_id)).filter(Boolean)));

  for (const poLineId of poLineIds) {
    const { data: poLine } = await supabase
      .from("vyron_cost_purchase_order_lines")
      .select("id, ordered_qty")
      .eq("id", poLineId)
      .maybeSingle();
    if (!poLine) continue;

    const { data: linkedReceiptLines } = await supabase
      .from("vyron_cost_goods_receipt_lines")
      .select("received_qty, damaged_qty, rejected_qty")
      .eq("purchase_order_line_id", poLineId);

    const received = (linkedReceiptLines || []).reduce((sum, row) => sum + Number(row.received_qty || 0), 0);
    const damaged = (linkedReceiptLines || []).reduce((sum, row) => sum + Number(row.damaged_qty || 0), 0);
    const rejected = (linkedReceiptLines || []).reduce((sum, row) => sum + Number(row.rejected_qty || 0), 0);
    const outstanding = Math.max(0, Number(poLine.ordered_qty || 0) - received - damaged - rejected);

    await supabase
      .from("vyron_cost_purchase_order_lines")
      .update({
        received_qty: received,
        damaged_qty: damaged,
        rejected_qty: rejected,
        outstanding_qty: outstanding,
        updated_at: new Date().toISOString(),
      })
      .eq("id", poLineId);
  }

  if (grn.purchase_order_id) {
    const { data: poLines } = await supabase
      .from("vyron_cost_purchase_order_lines")
      .select("ordered_qty, received_qty, outstanding_qty")
      .eq("purchase_order_id", grn.purchase_order_id);

    const anyReceived = (poLines || []).some((line) => Number(line.received_qty || 0) > 0);
    const hasOutstanding = (poLines || []).some((line) => Number(line.outstanding_qty || 0) > 0.001);
    const nextStatus = !anyReceived ? "Approved" : hasOutstanding ? "Partially Received" : "Fully Received";

    await supabase
      .from("vyron_cost_purchase_orders")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", grn.purchase_order_id);

    await supabase.from("vyron_cost_back_orders").delete().eq("purchase_order_id", grn.purchase_order_id).eq("status", "Open");

    for (const poLineId of poLineIds) {
      const { data: line } = await supabase
        .from("vyron_cost_purchase_order_lines")
        .select("id, item_name, outstanding_qty, unit, purchase_order_id")
        .eq("id", poLineId)
        .maybeSingle();
      if (!line || Number(line.outstanding_qty || 0) <= 0.001) continue;
      await supabase.from("vyron_cost_back_orders").insert({
        company_id: grn.company_id,
        purchase_order_id: grn.purchase_order_id,
        purchase_order_line_id: poLineId,
        item_name: line.item_name,
        outstanding_qty: Number(line.outstanding_qty || 0),
        status: "Open",
      });
    }
  }

  await writeProcurementAudit(supabase, {
    companyId: String(grn.company_id),
    eventType: "GRN Updated",
    entityType: "goods_receipt",
    entityId: id,
    entityLabel: String(grn.grn_number || id),
    detail: `Goods received note ${grn.grn_number || id} was updated.`,
    actor: "user",
  });

  return NextResponse.json({ ok: true });
}
