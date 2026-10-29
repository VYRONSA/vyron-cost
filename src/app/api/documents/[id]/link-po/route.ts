import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { linkDocumentToPurchaseOrder } from "@/lib/vyron-procurement";
import {
  documentTenantAccessErrorResponse,
  loadDocumentForTenant,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, WorkspaceAccessError, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const purchaseOrderId = String(body.purchaseOrderId || "");
  if (!purchaseOrderId) {
    return NextResponse.json({ ok: false, error: "purchaseOrderId is required." }, { status: 400 });
  }

  try {
    // The invoice review screen's own access (suppliers.view). The actor is the
    // verified member, and the purchase order must belong to the same company.
    const session = await requireWorkspacePermission("suppliers.view");
    const tenantId = await requireDocumentTenantId();
    await loadDocumentForTenant(supabase, documentId, tenantId, "id, tenant_id");
    const result = await linkDocumentToPurchaseOrder(supabase, {
      companyId: tenantId,
      documentId,
      purchaseOrderId,
      actor: await memberDisplayName(supabase, session),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return workspaceAccessErrorResponse(error, "Link failed.");
    return documentTenantAccessErrorResponse(error, "Link failed.");
  }
}
