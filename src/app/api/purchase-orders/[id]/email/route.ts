import { NextRequest } from "next/server";
import { getPurchaseOrderDetail, writeProcurementAudit } from "@/lib/vyron-procurement";
import { buildPurchaseOrderPdf } from "@/lib/platform/documents/adapters/purchase-order";
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
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspace hints from the client. They can only narrow the verified company, never choose it. */
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
  const { id: poId } = await context.params;
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return documentEmailServiceUnavailable("purchase order email: Supabase service role unavailable");

  const body = await readJsonObject(request);

  try {
    await requirePackageFeature("purchase_orders");
    const session = await requireWorkspacePermission("purchase_orders.approve");

    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request, body));
    if (!companyId) return noWorkspaceCompanyResponse();

    const po = await getPurchaseOrderDetail(supabase, poId, companyId);
    if (!po || !belongsToCompany(po.company_id, companyId)) return documentNotFoundResponse("Purchase order");
    const poNumber = String(po.po_number);

    const [identity, { data: supplier }] = await Promise.all([
      loadWorkspaceEmailIdentity(supabase, companyId),
      po.supplier_id
        ? supabase
            .from("vyron_cost_suppliers")
            .select("supplier_name, contact_email, invoice_email")
            .eq("id", po.supplier_id)
            .eq("company_id", companyId)
            .maybeSingle()
        : Promise.resolve({ data: null as Record<string, unknown> | null }),
    ]);

    const delivery = await deliverDocumentEmail({
      documentType: "purchase_order",
      documentId: poId,
      documentNumber: poNumber,
      documentLabel: "Purchase Order",
      requestedTo: body.to,
      defaultTo: supplier?.contact_email || supplier?.invoice_email,
      requestedCc: body.cc,
      requestedBcc: body.bcc,
      senderName: identity.senderName,
      recipientName: String(po.supplier_name_snapshot || supplier?.supplier_name || "") || null,
      buildPdf: () => buildPurchaseOrderPdf(supabase, companyId, poId),
    });

    if (shouldAuditDelivery(delivery)) {
      const actor = auditActorFromSession(session);
      const accepted = delivery.outcome === "accepted";
      // A pointer to an earlier attempt, kept only if it has the shape of one.
      const retryOf = typeof body.retryOf === "string" && UUID_PATTERN.test(body.retryOf.trim()) ? body.retryOf.trim() : null;
      await writeAuditSafely(
        () =>
          writeProcurementAudit(supabase, {
            companyId,
            eventType: accepted ? "PO Email Sent" : "PO Email Failed",
            entityType: "purchase_order",
            entityId: poId,
            entityLabel: poNumber,
            detail: accepted
              ? `Purchase order ${poNumber} accepted by the email provider for delivery to ${delivery.recipient}.`
              : `Purchase order ${poNumber} was not emailed to ${delivery.recipient} (${delivery.outcome}).`,
            actor,
            metadata: documentEmailAuditMetadata(delivery, {
              companyId,
              documentType: "purchase_order",
              documentId: poId,
              documentNumber: poNumber,
              actorUserId: actor,
              extra: { retry_of: retryOf },
            }),
          }),
        `purchase order ${poId}`
      );
    }

    return documentEmailResponse(delivery);
  } catch (error) {
    return documentEmailErrorResponse(error, "purchase order email");
  }
}
