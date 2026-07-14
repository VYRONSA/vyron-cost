import { NextRequest, NextResponse } from "next/server";
import { buildSalesOrderPdf } from "@/lib/platform/documents/adapters/sales-order";
import { sendDocumentEmail } from "@/lib/platform/documents/sendDocumentEmail";
import { getCustomerSalesOrder, writeSalesOrderAudit } from "@/lib/vyron-customer-sales-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: salesOrderId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("sales_orders.approve");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const loaded = await getCustomerSalesOrder(supabase, companyId, salesOrderId);
    if (!loaded) return NextResponse.json({ ok: false, error: "Sales order not found." }, { status: 404 });

    const { data: customer } = loaded.order.customer_id
      ? await supabase.from("vyron_customers").select("email").eq("id", loaded.order.customer_id).eq("company_id", companyId).maybeSingle()
      : { data: null as Record<string, unknown> | null };

    const to = String(body.to || customer?.email || "").trim();
    if (!to) return NextResponse.json({ ok: false, error: "Recipient email is required." }, { status: 400 });

    const subject = String(body.subject || `Sales Order ${loaded.order.order_number}`).trim();
    const textBody = String(body.textBody || `Please find attached sales order ${loaded.order.order_number}.`).trim();
    const htmlBody = String(body.htmlBody || `<p>Please find attached sales order <strong>${loaded.order.order_number}</strong>.</p>`).trim();

    const pdf = await buildSalesOrderPdf(supabase, companyId, salesOrderId);
    if (!pdf) return NextResponse.json({ ok: false, error: "Sales order not found." }, { status: 404 });

    const result = await sendDocumentEmail({
      documentType: "sales_order",
      documentId: salesOrderId,
      documentNumber: String(loaded.order.order_number),
      to,
      subject,
      textBody,
      htmlBody,
      pdfFileName: `${String(loaded.order.order_number)}.pdf`,
      pdfBytes: pdf.bytes,
    });

    await writeSalesOrderAudit(supabase, {
      companyId,
      salesOrderId,
      eventType: result.status === "sent" ? "Sales Order Email Sent" : "Sales Order Email Failed",
      detail:
        result.status === "sent"
          ? `Sales order ${loaded.order.order_number} emailed to ${to}.`
          : `Failed to email sales order ${loaded.order.order_number} to ${to}.`,
      actor: String(body.actor || "user"),
      metadata: { status: result.status, provider: result.provider, message_id: result.messageId, error: result.error, recipient: to },
    });

    return NextResponse.json({ ok: result.status === "sent", ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Send sales order email failed.");
  }
}
