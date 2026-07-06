import { NextRequest, NextResponse } from "next/server";
import { deleteVyronDocument } from "@/lib/vyron-document-delete";
import { writeProcurementAudit } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

function companyContextFromRequest(request: NextRequest) {
  return {
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
    companyId: request.nextUrl.searchParams.get("companyId"),
  };
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id: poId, documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.delete");

    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const { data: po } = await supabase
      .from("vyron_cost_purchase_orders")
      .select("id, po_number")
      .eq("id", poId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!po) return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });

    const { data: document, error: docError } = await supabase
      .from("vyron_documents")
      .select("id, storage_bucket, storage_path, deleted_at")
      .eq("id", documentId)
      .eq("tenant_id", companyId)
      .eq("purchase_order_id", poId)
      .maybeSingle();
    if (docError) throw new Error(docError.message);
    if (!document) return NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });

    const result = await deleteVyronDocument(supabase, {
      id: String(document.id),
      storage_bucket: document.storage_bucket ? String(document.storage_bucket) : null,
      storage_path: document.storage_path ? String(document.storage_path) : null,
      deleted_at: document.deleted_at ? String(document.deleted_at) : null,
    });
    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    await writeProcurementAudit(supabase, {
      companyId,
      eventType: "PO Attachment Deleted",
      entityType: "purchase_order",
      entityId: poId,
      entityLabel: String(po.po_number),
      detail: `Attachment ${documentId} deleted from ${po.po_number}.`,
      actor: "user",
      metadata: {
        document_id: documentId,
        action: result.action,
      },
    });

    return NextResponse.json({ ok: true, action: result.action, storageArchived: result.storageArchived || false });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete attachment failed.");
  }
}
