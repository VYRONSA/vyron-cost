import { NextRequest, NextResponse } from "next/server";
import { sendPurchaseOrderEmail } from "@/lib/vyron-po-email";
import { getPurchaseOrderDetail, writeProcurementAudit } from "@/lib/vyron-procurement";
import { buildPurchaseOrderPdf } from "@/lib/platform/documents/adapters/purchase-order";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

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

function parseList(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  return input.map((value) => String(value || "").trim()).filter((value) => value.length > 0);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: poId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.approve");

    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request, body));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const po = await getPurchaseOrderDetail(supabase, poId, companyId);
    if (!po) return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });

    const { data: supplier } = po.supplier_id
      ? await supabase.from("vyron_cost_suppliers").select("*").eq("id", po.supplier_id).eq("company_id", companyId).maybeSingle()
      : { data: null as Record<string, unknown> | null };

    const to = String(body.to || supplier?.contact_email || supplier?.invoice_email || "").trim();
    if (!to) {
      return NextResponse.json({ ok: false, error: "Supplier recipient email is required." }, { status: 400 });
    }

    const cc = parseList(body.cc);
    const bcc = parseList(body.bcc);
    const subject = String(body.subject || `Purchase Order ${po.po_number}`).trim();
    const textBody = String(
      body.textBody ||
        `Please find attached purchase order ${po.po_number}.\nSupplier: ${po.supplier_name_snapshot || "Supplier"}\nTotal: ${Number(po.total || 0).toFixed(2)}`
    ).trim();
    const htmlBody = String(
      body.htmlBody ||
        `<p>Please find attached purchase order <strong>${po.po_number}</strong>.</p><p>Supplier: ${po.supplier_name_snapshot || "Supplier"}<br/>Total: ${Number(po.total || 0).toFixed(2)}</p>`
    ).trim();

    const pdf = await buildPurchaseOrderPdf(supabase, companyId, poId);
    if (!pdf) return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });

    const result = await sendPurchaseOrderEmail({
      purchaseOrderId: poId,
      poNumber: String(po.po_number),
      to,
      cc,
      bcc,
      subject,
      textBody,
      htmlBody,
      pdfFileName: `${String(po.po_number)}.pdf`,
      pdfBytes: pdf.bytes,
    });

    const actor = String(body.actor || "user");
    const retryOf = String(body.retryOf || "").trim() || null;

    await writeProcurementAudit(supabase, {
      companyId,
      eventType: result.status === "sent" ? "PO Email Sent" : "PO Email Failed",
      entityType: "purchase_order",
      entityId: poId,
      entityLabel: String(po.po_number),
      detail:
        result.status === "sent"
          ? `Purchase order ${po.po_number} emailed to ${to}.`
          : `Failed to email purchase order ${po.po_number} to ${to}.`,
      actor,
      metadata: {
        status: result.status,
        provider: result.provider,
        message_id: result.messageId,
        error: result.error,
        recipient: to,
        cc,
        bcc,
        subject,
        sent_at: new Date().toISOString(),
        retry_of: retryOf,
        raw_response: result.rawResponse || null,
      },
    });

    return NextResponse.json({ ok: result.status === "sent", ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Send purchase order email failed.");
  }
}
