import { NextRequest, NextResponse } from "next/server";
import { buildGoodsReceiptPdf } from "@/lib/platform/documents/adapters/goods-receipt";
import { sendDocumentEmail } from "@/lib/platform/documents/sendDocumentEmail";
import { writeProcurementAudit } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

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

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: grnId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("goods_receipts.approve");
    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request, body));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const { data: grn } = await supabase
      .from("vyron_cost_goods_receipts")
      .select("id, grn_number, supplier_id")
      .eq("id", grnId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!grn) return NextResponse.json({ ok: false, error: "Goods receipt not found." }, { status: 404 });

    const { data: supplier } = grn.supplier_id
      ? await supabase.from("vyron_cost_suppliers").select("contact_email, invoice_email").eq("id", grn.supplier_id).eq("company_id", companyId).maybeSingle()
      : { data: null as Record<string, unknown> | null };

    const to = String(body.to || supplier?.contact_email || supplier?.invoice_email || "").trim();
    if (!to) return NextResponse.json({ ok: false, error: "Recipient email is required." }, { status: 400 });

    const subject = String(body.subject || `Goods Receipt Note ${grn.grn_number}`).trim();
    const textBody = String(body.textBody || `Please find attached goods receipt note ${grn.grn_number}.`).trim();
    const htmlBody = String(body.htmlBody || `<p>Please find attached goods receipt note <strong>${grn.grn_number}</strong>.</p>`).trim();

    const pdf = await buildGoodsReceiptPdf(supabase, companyId, grnId);
    if (!pdf) return NextResponse.json({ ok: false, error: "Goods receipt not found." }, { status: 404 });

    const result = await sendDocumentEmail({
      documentType: "goods_receipt",
      documentId: grnId,
      documentNumber: String(grn.grn_number),
      to,
      subject,
      textBody,
      htmlBody,
      pdfFileName: `${String(grn.grn_number)}.pdf`,
      pdfBytes: pdf.bytes,
    });

    await writeProcurementAudit(supabase, {
      companyId,
      eventType: result.status === "sent" ? "GRN Email Sent" : "GRN Email Failed",
      entityType: "goods_receipt",
      entityId: grnId,
      entityLabel: String(grn.grn_number),
      detail:
        result.status === "sent"
          ? `Goods receipt note ${grn.grn_number} emailed to ${to}.`
          : `Failed to email goods receipt note ${grn.grn_number} to ${to}.`,
      actor: String(body.actor || "user"),
      metadata: { status: result.status, provider: result.provider, message_id: result.messageId, error: result.error, recipient: to },
    });

    return NextResponse.json({ ok: result.status === "sent", ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Send goods receipt email failed.");
  }
}
