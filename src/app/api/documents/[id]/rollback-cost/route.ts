import { NextRequest, NextResponse } from "next/server";
import { SUPPLIER_INVOICE_COST_ROLLBACK_PERMISSION } from "@/lib/vyron-document-approval-audit";
import { rollbackDocumentCostUpdates } from "@/lib/vyron-document-cost-rollback";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
  verifyDocumentTenantAccess,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const notes = String(body?.notes || "").trim();

  /*
   * Rolling back an invoice's cost updates is authorised by the signed-in
   * member's supplier_invoices.rollback_cost permission, not a shared PIN. Who
   * rolled back is that member, never a name the browser sends.
   */
  let session: WorkspaceSession;
  try {
    session = await requireWorkspacePermission(SUPPLIER_INVOICE_COST_ROLLBACK_PERMISSION);
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Rollback not authorised.");
  }

  if (!notes) {
    return NextResponse.json({ ok: false, error: "A rollback reason is required." }, { status: 400 });
  }
  if (notes.length > 500) {
    return NextResponse.json({ ok: false, error: "A rollback reason must be 500 characters or fewer." }, { status: 400 });
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  let tenantId: string;
  try {
    tenantId = await requireDocumentTenantId();
  } catch (error) {
    return documentTenantAccessErrorResponse(error);
  }

  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, tenant_id, status")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  const denied = verifyDocumentTenantAccess(document, tenantId);
  if (denied) return denied;

  try {
    const result = await rollbackDocumentCostUpdates(supabase, {
      tenantId,
      documentId,
      rolledBackBy: await memberDisplayName(supabase, session),
      notes,
      authorisation: { userId: session.userId, role: session.role, permission: SUPPLIER_INVOICE_COST_ROLLBACK_PERMISSION },
    });
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Rolled back ${result.reversed} cost update(s). Price history preserved.`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Rollback failed." },
      { status: 400 }
    );
  }
}
