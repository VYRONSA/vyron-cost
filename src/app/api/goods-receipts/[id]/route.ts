import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { reverseGoodsReceipt, writeProcurementAudit } from "@/lib/vyron-procurement";
import { hasGrnPostedStock } from "@/lib/vyron-inventory";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function companyContextFromRequest(request: NextRequest, body?: Record<string, unknown>) {
  return {
    workspaceId:
      request.nextUrl.searchParams.get("workspaceId") ||
      (typeof body?.workspaceId === "string" ? body.workspaceId : null),
    companyId:
      request.nextUrl.searchParams.get("companyId") ||
      (typeof body?.companyId === "string" ? body.companyId : null),
  };
}

async function requireGrnCompanyId(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  ctx: { workspaceId?: string | null; companyId?: string | null }
) {
  const companyId = await resolveApiCompanyIdWithContext(supabase, ctx);
  if (!companyId) throw new Error("No active workspace company. Select a client workspace first.");
  return companyId;
}

function lineQuantitiesChanged(
  existing: Array<{ id?: string; received_qty?: number; damaged_qty?: number; rejected_qty?: number }>,
  incoming: Array<{ id?: string; received_qty?: number; damaged_qty?: number; rejected_qty?: number }>
) {
  const existingById = new Map(existing.filter((line) => line.id).map((line) => [String(line.id), line]));
  for (const line of incoming) {
    if (!line.id) continue;
    const prior = existingById.get(String(line.id));
    if (!prior) return true;
    if (Number(prior.received_qty || 0) !== Number(line.received_qty || 0)) return true;
    if (Number(prior.damaged_qty || 0) !== Number(line.damaged_qty || 0)) return true;
    if (Number(prior.rejected_qty || 0) !== Number(line.rejected_qty || 0)) return true;
  }
  return false;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("goods_receipts.view");
    const companyId = await requireGrnCompanyId(supabase, companyContextFromRequest(request));

    const { data: grn, error } = await supabase
      .from("vyron_cost_goods_receipts")
      .select("*, vyron_cost_purchase_orders(id, po_number, supplier_name_snapshot)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!grn) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    const { data: lines } = await supabase
      .from("vyron_cost_goods_receipt_lines")
      .select("*")
      .eq("goods_receipt_id", id)
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true });

    const stockPosted = await hasGrnPostedStock(supabase, companyId, id);

    return NextResponse.json(
      { ok: true, receipt: { ...grn, lines: lines || [], stock_posted: stockPosted } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
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

  if (body.action === "reverse") {
    try {
      await requireWorkspacePermission("goods_receipts.approve");
      const companyId = await requireGrnCompanyId(supabase, companyContextFromRequest(request, body));
      const result = await reverseGoodsReceipt(supabase, companyId, id, {
        reason: String(body.reason || ""),
        actor: String(body.actor || body.received_by || "user"),
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return workspaceAccessErrorResponse(error, "GRN reversal failed.");
    }
  }

  const lines = Array.isArray(body.lines) ? body.lines : [];

  try {
    await requireWorkspacePermission("goods_receipts.create");
    const companyId = await requireGrnCompanyId(supabase, companyContextFromRequest(request, body));

    const { data: grn, error: grnLoadError } = await supabase
      .from("vyron_cost_goods_receipts")
      .select("id, company_id, purchase_order_id, grn_number, status, notes")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (grnLoadError) return NextResponse.json({ ok: false, error: grnLoadError.message }, { status: 500 });
    if (!grn) return NextResponse.json({ ok: false, error: "GRN not found." }, { status: 404 });
    if (String(grn.status) === "Reversed") {
      return NextResponse.json({ ok: false, error: "Reversed GRNs cannot be edited." }, { status: 409 });
    }

    const { data: existingLines } = await supabase
      .from("vyron_cost_goods_receipt_lines")
      .select("id, received_qty, damaged_qty, rejected_qty")
      .eq("goods_receipt_id", id)
      .eq("company_id", companyId);

    const stockPosted = await hasGrnPostedStock(supabase, companyId, id);
    const quantitiesChanged = lineQuantitiesChanged(existingLines || [], lines);
    const statusChanged = String(body.status || grn.status) !== String(grn.status);
    const notesOnly =
      !quantitiesChanged &&
      !statusChanged &&
      (body.notes !== undefined ? String(body.notes || "") !== String(grn.notes || "") : false);

    if (stockPosted && (quantitiesChanged || statusChanged)) {
      return NextResponse.json(
        {
          ok: false,
          error: "This GRN has posted stock. Reverse stock movements before changing quantities or status.",
        },
        { status: 409 }
      );
    }

    if (stockPosted && !notesOnly && body.notes === undefined) {
      return NextResponse.json(
        { ok: false, error: "This GRN has posted stock. Only notes can be updated without reversing stock." },
        { status: 409 }
      );
    }

    const headerPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.notes !== undefined) headerPatch.notes = body.notes || null;
    if (!stockPosted && body.status !== undefined) headerPatch.status = String(body.status || "Posted");

    const { error: headerError } = await supabase
      .from("vyron_cost_goods_receipts")
      .update(headerPatch)
      .eq("id", id)
      .eq("company_id", companyId);
    if (headerError) return NextResponse.json({ ok: false, error: headerError.message }, { status: 500 });

    if (!stockPosted) {
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
          .eq("id", line.id)
          .eq("company_id", companyId)
          .eq("goods_receipt_id", id);
        if (lineError) return NextResponse.json({ ok: false, error: lineError.message }, { status: 500 });
      }

      const { data: receiptLines } = await supabase
        .from("vyron_cost_goods_receipt_lines")
        .select("purchase_order_line_id")
        .eq("goods_receipt_id", id)
        .eq("company_id", companyId)
        .not("purchase_order_line_id", "is", null);

      const poLineIds = Array.from(
        new Set((receiptLines || []).map((row) => String(row.purchase_order_line_id)).filter(Boolean))
      );

      for (const poLineId of poLineIds) {
        const { data: poLine } = await supabase
          .from("vyron_cost_purchase_order_lines")
          .select("id, ordered_qty")
          .eq("id", poLineId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (!poLine) continue;

        const { data: linkedReceiptLines } = await supabase
          .from("vyron_cost_goods_receipt_lines")
          .select("received_qty, damaged_qty, rejected_qty")
          .eq("purchase_order_line_id", poLineId)
          .eq("company_id", companyId);

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
          .eq("id", poLineId)
          .eq("company_id", companyId);
      }

      if (grn.purchase_order_id) {
        const { data: poLines } = await supabase
          .from("vyron_cost_purchase_order_lines")
          .select("ordered_qty, received_qty, outstanding_qty")
          .eq("purchase_order_id", grn.purchase_order_id)
          .eq("company_id", companyId);

        const anyReceived = (poLines || []).some((line) => Number(line.received_qty || 0) > 0);
        const hasOutstanding = (poLines || []).some((line) => Number(line.outstanding_qty || 0) > 0.001);
        const nextStatus = !anyReceived ? "Approved" : hasOutstanding ? "Partially Received" : "Fully Received";

        await supabase
          .from("vyron_cost_purchase_orders")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", grn.purchase_order_id)
          .eq("company_id", companyId);

        await supabase
          .from("vyron_cost_back_orders")
          .delete()
          .eq("purchase_order_id", grn.purchase_order_id)
          .eq("company_id", companyId)
          .eq("status", "Open");

        for (const poLineId of poLineIds) {
          const { data: line } = await supabase
            .from("vyron_cost_purchase_order_lines")
            .select("id, item_name, outstanding_qty, unit, purchase_order_id")
            .eq("id", poLineId)
            .eq("company_id", companyId)
            .maybeSingle();
          if (!line || Number(line.outstanding_qty || 0) <= 0.001) continue;
          await supabase.from("vyron_cost_back_orders").insert({
            company_id: companyId,
            purchase_order_id: grn.purchase_order_id,
            purchase_order_line_id: poLineId,
            item_name: line.item_name,
            outstanding_qty: Number(line.outstanding_qty || 0),
            status: "Open",
          });
        }
      }
    }

    await writeProcurementAudit(supabase, {
      companyId,
      eventType: "GRN Updated",
      entityType: "goods_receipt",
      entityId: id,
      entityLabel: String(grn.grn_number || id),
      detail: `Goods received note ${grn.grn_number || id} was updated.`,
      actor: "user",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update failed.");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("goods_receipts.create");
    const companyId = await requireGrnCompanyId(supabase, companyContextFromRequest(request));

    const { data: grn, error: grnLoadError } = await supabase
      .from("vyron_cost_goods_receipts")
      .select("id, grn_number")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (grnLoadError) return NextResponse.json({ ok: false, error: grnLoadError.message }, { status: 500 });
    if (!grn) return NextResponse.json({ ok: false, error: "GRN not found." }, { status: 404 });

    const stockPosted = await hasGrnPostedStock(supabase, companyId, id);
    if (stockPosted) {
      return NextResponse.json(
        { ok: false, error: "Cannot delete GRN with posted stock. Reverse stock movements first." },
        { status: 409 }
      );
    }

    await supabase.from("vyron_cost_goods_receipt_lines").delete().eq("goods_receipt_id", id).eq("company_id", companyId);
    const { error: deleteError } = await supabase
      .from("vyron_cost_goods_receipts")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });

    await writeProcurementAudit(supabase, {
      companyId,
      eventType: "GRN Deleted",
      entityType: "goods_receipt",
      entityId: id,
      entityLabel: String(grn.grn_number || id),
      detail: `Goods received note ${grn.grn_number || id} was deleted.`,
      actor: "user",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete failed.");
  }
}
