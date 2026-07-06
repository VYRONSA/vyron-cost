import { NextRequest, NextResponse } from "next/server";
import {
  deletePurchaseOrder,
  getPurchaseOrderArchiveState,
  getPurchaseOrderDetail,
  savePurchaseOrder,
  transitionPurchaseOrder,
} from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

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

async function requirePoCompanyId(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, ctx: {
  workspaceId?: string | null;
  companyId?: string | null;
}) {
  const companyId = await resolveApiCompanyIdWithContext(supabase, ctx);
  if (!companyId) throw new Error("No active workspace company. Select a client workspace first.");
  return companyId;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.view");
    const companyId = await requirePoCompanyId(supabase, companyContextFromRequest(request));
    const po = await getPurchaseOrderDetail(supabase, id, companyId);
    if (!po) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    const archive = await getPurchaseOrderArchiveState(supabase, companyId, id);

    const [{ data: goodsReceipts }, { data: linkedInvoices }] = await Promise.all([
      supabase
        .from("vyron_cost_goods_receipts")
        .select("id, grn_number, receipt_type, received_at, status")
        .eq("purchase_order_id", id)
        .eq("company_id", companyId)
        .order("received_at", { ascending: false }),
      supabase
        .from("vyron_documents")
        .select("id, invoice_number, status, total, archived_at")
        .eq("purchase_order_id", id)
        .eq("tenant_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const supplierId = po.supplier_id ? String(po.supplier_id) : "";
    const supplier = supplierId
      ? await supabase
          .from("vyron_cost_suppliers")
          .select("id, supplier_name, contact_email, invoice_email, phone")
          .eq("id", supplierId)
          .eq("company_id", companyId)
          .maybeSingle()
      : { data: null, error: null };

    return NextResponse.json({
      ok: true,
      purchaseOrder: {
        ...po,
        archived: archive.archived,
        archived_at: archive.archivedAt,
        archived_by: archive.archivedBy,
        archive_reason: archive.reason,
        supplier: supplier.data || null,
      },
      goodsReceipts: goodsReceipts || [],
      linkedInvoices: linkedInvoices || [],
      supplier: supplier.data || null,
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
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
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.edit");
    const companyId = await requirePoCompanyId(supabase, companyContextFromRequest(request, body));
    const po = await savePurchaseOrder(
      supabase,
      companyId,
      {
        id,
        po_number: String(body.po_number || ""),
        supplier_id: body.supplier_id || null,
        supplier_name_snapshot: String(body.supplier_name_snapshot || ""),
        status: body.status || "Draft",
        order_date: body.order_date,
        notes: body.notes,
        header_discount_pct: body.header_discount_pct,
        header_discount_value: body.header_discount_value,
        lines: Array.isArray(body.lines) ? body.lines : [],
      },
      String(body.actor || "user")
    );
    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update failed.");
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
    await requirePackageFeature("purchase_orders");
    const approvalStatuses = new Set([
      "Approved",
      "Sent",
      "Closed",
      "Cancelled",
      "Rejected",
      "Awaiting Revision",
      "Returned for Changes",
    ]);
    await requireWorkspacePermission(
      approvalStatuses.has(status) ? "purchase_orders.approve" : "purchase_orders.edit"
    );
    const companyId = await requirePoCompanyId(supabase, companyContextFromRequest(request, body));
    const rejectReason = String(body.rejectReason || body.rejectionReason || "").trim();
    const approvalComments = String(body.approvalComments || "").trim();
    const combinedNotes = [body.approvalNotes, rejectReason ? `Reject reason: ${rejectReason}` : "", approvalComments]
      .filter((part) => String(part || "").trim().length > 0)
      .map((part) => String(part).trim())
      .join(" · ");
    const { purchaseOrder, approvalTier } = await transitionPurchaseOrder(supabase, id, status, companyId, {
      approvedBy: body.approvedBy,
      approvalNotes: combinedNotes || body.approvalNotes,
      actor: body.actor,
    });
    return NextResponse.json({ ok: true, purchaseOrder, approvalTier });
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
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.delete");
    const companyId = await requirePoCompanyId(supabase, companyContextFromRequest(request));
    await deletePurchaseOrder(supabase, companyId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete failed.");
  }
}
