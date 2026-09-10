import { NextRequest } from "next/server";
import { buildCustomerInvoicePdf } from "@/lib/platform/documents/adapters/customer-invoice";
import {
  auditActorFromSession,
  belongsToCompany,
  deliverDocumentEmail,
  documentEmailAuditMetadata,
  documentEmailErrorResponse,
  documentEmailResponse,
  documentEmailServiceUnavailable,
  documentNotFoundResponse,
  loadWorkspaceEmailIdentity,
  noWorkspaceCompanyResponse,
  readJsonObject,
  shouldAuditDelivery,
  writeAuditSafely,
} from "@/lib/platform/documents/document-email-route";
import { getCustomerInvoice, updateCustomerInvoiceStatus } from "@/lib/vyron-customer-invoices";
import { writeInventoryAudit } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Email a customer invoice PDF to the customer.
 *
 * The browser supplies only the recipient. Company, invoice, customer, sender,
 * Reply-To, subject, body and PDF are all derived here from the verified
 * workspace, and the audit actor is the authenticated member.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: invoiceId } = await context.params;
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return documentEmailServiceUnavailable("customer invoice email: Supabase service role unavailable");

  const body = await readJsonObject(request);

  try {
    const session = await requireWorkspacePermission("invoices.email");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return noWorkspaceCompanyResponse();

    const loaded = await getCustomerInvoice(supabase, invoiceId, companyId);
    // Re-asserted rather than assumed: an invoice with no company is never emailed.
    if (!loaded || !belongsToCompany(loaded.invoice.company_id, companyId)) return documentNotFoundResponse("Invoice");
    const invoice = loaded.invoice;
    const invoiceNumber = String(invoice.invoice_number);

    const [identity, { data: customer }] = await Promise.all([
      loadWorkspaceEmailIdentity(supabase, companyId),
      invoice.customer_id
        ? supabase.from("vyron_customers").select("email").eq("id", invoice.customer_id).eq("company_id", companyId).maybeSingle()
        : Promise.resolve({ data: null as Record<string, unknown> | null }),
    ]);

    const delivery = await deliverDocumentEmail({
      documentType: "customer_invoice",
      documentId: invoiceId,
      documentNumber: invoiceNumber,
      documentLabel: "Invoice",
      requestedTo: body.to,
      defaultTo: customer?.email,
      senderName: identity.senderName,
      recipientName: invoice.customer_name ? String(invoice.customer_name) : null,
      workspaceRemittanceEmail: identity.remittanceEmail,
      buildPdf: () => buildCustomerInvoicePdf(supabase, companyId, invoiceId),
    });

    /*
     * An approved invoice that the provider accepted has been issued to the
     * customer, so it becomes Sent — here, on the server, and only on
     * acceptance. Any other status is left exactly as it was.
     */
    const statusBefore = String(invoice.status);
    let invoiceStatus = statusBefore;
    if (delivery.outcome === "accepted" && statusBefore === "Approved") {
      try {
        const updated = await updateCustomerInvoiceStatus(supabase, invoiceId, "Sent", companyId);
        invoiceStatus = String(updated.status);
      } catch (error) {
        console.error("[document-email] invoice emailed but status not advanced to Sent", { invoiceId, error });
      }
    }

    if (shouldAuditDelivery(delivery)) {
      const actor = auditActorFromSession(session);
      const accepted = delivery.outcome === "accepted";
      await writeAuditSafely(
        () =>
          writeInventoryAudit(supabase, {
            companyId,
            eventType: accepted ? "Invoice Email Sent" : "Invoice Email Failed",
            referenceType: "customer_invoice",
            referenceId: invoiceId,
            detail: accepted
              ? `Invoice ${invoiceNumber} accepted by the email provider for delivery to ${delivery.recipient}.`
              : `Invoice ${invoiceNumber} was not emailed to ${delivery.recipient} (${delivery.outcome}).`,
            actor,
            metadata: documentEmailAuditMetadata(delivery, {
              companyId,
              documentType: "customer_invoice",
              documentId: invoiceId,
              documentNumber: invoiceNumber,
              actorUserId: actor,
              extra: { invoice_status_before: statusBefore, invoice_status_after: invoiceStatus },
            }),
          }),
        `invoice ${invoiceId}`
      );
    }

    return documentEmailResponse(delivery, { invoiceStatus });
  } catch (error) {
    return documentEmailErrorResponse(error, "customer invoice email");
  }
}
