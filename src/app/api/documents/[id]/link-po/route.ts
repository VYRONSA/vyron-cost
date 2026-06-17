import { NextRequest, NextResponse } from "next/server";
import { linkDocumentToPurchaseOrder } from "@/lib/vyron-procurement";
import {
  documentTenantAccessErrorResponse,
  loadDocumentForTenant,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

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
    const tenantId = await requireDocumentTenantId();
    await loadDocumentForTenant(supabase, documentId, tenantId, "id, tenant_id");
    const result = await linkDocumentToPurchaseOrder(supabase, {
      documentId,
      purchaseOrderId,
      actor: body.actor || "reviewer",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Link failed.");
  }
}
