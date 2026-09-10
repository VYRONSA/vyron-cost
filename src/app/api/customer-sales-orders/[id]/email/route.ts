import { NextRequest } from "next/server";
import { buildSalesOrderPdf } from "@/lib/platform/documents/adapters/sales-order";
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
import { getCustomerSalesOrder, writeSalesOrderAudit } from "@/lib/vyron-customer-sales-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: salesOrderId } = await context.params;
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return documentEmailServiceUnavailable("sales order email: Supabase service role unavailable");

  const body = await readJsonObject(request);

  try {
    const session = await requireWorkspacePermission("sales_orders.approve");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return noWorkspaceCompanyResponse();

    const loaded = await getCustomerSalesOrder(supabase, companyId, salesOrderId);
    if (!loaded || !belongsToCompany(loaded.order.company_id, companyId)) return documentNotFoundResponse("Sales order");
    const order = loaded.order;
    const orderNumber = String(order.order_number);

    const [identity, { data: customer }] = await Promise.all([
      loadWorkspaceEmailIdentity(supabase, companyId),
      order.customer_id
        ? supabase.from("vyron_customers").select("email").eq("id", order.customer_id).eq("company_id", companyId).maybeSingle()
        : Promise.resolve({ data: null as Record<string, unknown> | null }),
    ]);

    const delivery = await deliverDocumentEmail({
      documentType: "sales_order",
      documentId: salesOrderId,
      documentNumber: orderNumber,
      documentLabel: "Sales Order",
      requestedTo: body.to,
      defaultTo: customer?.email,
      senderName: identity.senderName,
      recipientName: order.customer_name ? String(order.customer_name) : null,
      buildPdf: () => buildSalesOrderPdf(supabase, companyId, salesOrderId),
    });

    if (shouldAuditDelivery(delivery)) {
      const actor = auditActorFromSession(session);
      const accepted = delivery.outcome === "accepted";
      await writeAuditSafely(
        () =>
          writeSalesOrderAudit(supabase, {
            companyId,
            salesOrderId,
            eventType: accepted ? "Sales Order Email Sent" : "Sales Order Email Failed",
            detail: accepted
              ? `Sales order ${orderNumber} accepted by the email provider for delivery to ${delivery.recipient}.`
              : `Sales order ${orderNumber} was not emailed to ${delivery.recipient} (${delivery.outcome}).`,
            actor,
            metadata: documentEmailAuditMetadata(delivery, {
              companyId,
              documentType: "sales_order",
              documentId: salesOrderId,
              documentNumber: orderNumber,
              actorUserId: actor,
            }),
          }),
        `sales order ${salesOrderId}`
      );
    }

    return documentEmailResponse(delivery);
  } catch (error) {
    return documentEmailErrorResponse(error, "sales order email");
  }
}
