import { NextRequest, NextResponse } from "next/server";
import { buildCustomerInvoicePdf } from "@/lib/platform/documents/adapters/customer-invoice";
import { sendDocumentEmail } from "@/lib/platform/documents/sendDocumentEmail";
import { getCustomerInvoice } from "@/lib/vyron-customer-invoices";
import { writeInventoryAudit } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: invoiceId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("invoices.email");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const loaded = await getCustomerInvoice(supabase, invoiceId, companyId);
    if (!loaded) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });

    const { data: customer } = loaded.invoice.customer_id
      ? await supabase.from("vyron_customers").select("email").eq("id", loaded.invoice.customer_id).eq("company_id", companyId).maybeSingle()
      : { data: null as Record<string, unknown> | null };

    const to = String(body.to || customer?.email || "").trim();
    if (!to) return NextResponse.json({ ok: false, error: "Recipient email is required." }, { status: 400 });

    const subject = String(body.subject || `Invoice ${loaded.invoice.invoice_number}`).trim();
    const textBody = String(body.textBody || `Please find attached invoice ${loaded.invoice.invoice_number}.`).trim();
    const htmlBody = String(body.htmlBody || `<p>Please find attached invoice <strong>${loaded.invoice.invoice_number}</strong>.</p>`).trim();

    const pdf = await buildCustomerInvoicePdf(supabase, companyId, invoiceId);
    if (!pdf) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });

    const result = await sendDocumentEmail({
      documentType: "customer_invoice",
      documentId: invoiceId,
      documentNumber: String(loaded.invoice.invoice_number),
      to,
      subject,
      textBody,
      htmlBody,
      pdfFileName: `${String(loaded.invoice.invoice_number)}.pdf`,
      pdfBytes: pdf.bytes,
    });

    await writeInventoryAudit(supabase, {
      companyId,
      eventType: result.status === "sent" ? "Invoice Email Sent" : "Invoice Email Failed",
      referenceType: "customer_invoice",
      referenceId: invoiceId,
      detail:
        result.status === "sent"
          ? `Invoice ${loaded.invoice.invoice_number} emailed to ${to}.`
          : `Failed to email invoice ${loaded.invoice.invoice_number} to ${to}.`,
      actor: String(body.actor || "user"),
      metadata: { status: result.status, provider: result.provider, message_id: result.messageId, error: result.error, recipient: to },
    });

    return NextResponse.json({ ok: result.status === "sent", ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Send invoice email failed.");
  }
}
