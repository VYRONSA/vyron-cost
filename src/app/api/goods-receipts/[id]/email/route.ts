import { NextRequest } from "next/server";
import { buildGoodsReceiptPdf } from "@/lib/platform/documents/adapters/goods-receipt";
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
import { writeProcurementAudit } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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
  const { id: grnId } = await context.params;
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return documentEmailServiceUnavailable("goods receipt email: Supabase service role unavailable");

  const body = await readJsonObject(request);

  try {
    const session = await requireWorkspacePermission("goods_receipts.approve");
    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request, body));
    if (!companyId) return noWorkspaceCompanyResponse();

    const { data: grn } = await supabase
      .from("vyron_cost_goods_receipts")
      .select("id, grn_number, supplier_id, supplier_name_snapshot, company_id")
      .eq("id", grnId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!grn || !belongsToCompany(grn.company_id, companyId)) return documentNotFoundResponse("Goods receipt");
    const grnNumber = String(grn.grn_number);

    const [identity, { data: supplier }] = await Promise.all([
      loadWorkspaceEmailIdentity(supabase, companyId),
      grn.supplier_id
        ? supabase
            .from("vyron_cost_suppliers")
            .select("supplier_name, contact_email, invoice_email")
            .eq("id", grn.supplier_id)
            .eq("company_id", companyId)
            .maybeSingle()
        : Promise.resolve({ data: null as Record<string, unknown> | null }),
    ]);

    const delivery = await deliverDocumentEmail({
      documentType: "goods_receipt",
      documentId: grnId,
      documentNumber: grnNumber,
      documentLabel: "Goods Receipt Note",
      requestedTo: body.to,
      defaultTo: supplier?.contact_email || supplier?.invoice_email,
      senderName: identity.senderName,
      recipientName: String(grn.supplier_name_snapshot || supplier?.supplier_name || "") || null,
      buildPdf: () => buildGoodsReceiptPdf(supabase, companyId, grnId),
    });

    if (shouldAuditDelivery(delivery)) {
      const actor = auditActorFromSession(session);
      const accepted = delivery.outcome === "accepted";
      await writeAuditSafely(
        () =>
          writeProcurementAudit(supabase, {
            companyId,
            eventType: accepted ? "GRN Email Sent" : "GRN Email Failed",
            entityType: "goods_receipt",
            entityId: grnId,
            entityLabel: grnNumber,
            detail: accepted
              ? `Goods receipt note ${grnNumber} accepted by the email provider for delivery to ${delivery.recipient}.`
              : `Goods receipt note ${grnNumber} was not emailed to ${delivery.recipient} (${delivery.outcome}).`,
            actor,
            metadata: documentEmailAuditMetadata(delivery, {
              companyId,
              documentType: "goods_receipt",
              documentId: grnId,
              documentNumber: grnNumber,
              actorUserId: actor,
            }),
          }),
        `goods receipt ${grnId}`
      );
    }

    return documentEmailResponse(delivery);
  } catch (error) {
    return documentEmailErrorResponse(error, "goods receipt email");
  }
}
