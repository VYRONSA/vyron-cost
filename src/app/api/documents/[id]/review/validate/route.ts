import { NextRequest, NextResponse } from "next/server";
import { getDocumentApprovalRules } from "@/lib/vyron-document-approval-rules";
import { validateDocumentApproval } from "@/lib/vyron-document-approval-validation";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
  verifyDocumentTenantAccess,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  const body = await request.json().catch(() => ({}));

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
    .select(
      "id, tenant_id, supplier_name, invoice_number, invoice_date, purchase_order_number, supplier_vat_number, vat, subtotal, total, field_confidence"
    )
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  const denied = verifyDocumentTenantAccess(document, tenantId);
  if (denied) return denied;

  const { data: lines, error: linesError } = await supabase
    .from("vyron_document_line_items")
    .select("id, ignored, matched_entity_type, matched_entity_id, quantity, unit_price, vat, line_total")
    .eq("document_id", documentId);
  if (linesError) return NextResponse.json({ ok: false, error: linesError.message }, { status: 500 });

  const rules = await getDocumentApprovalRules(supabase, tenantId);
  const validation = validateDocumentApproval({
    document,
    lines: lines || [],
    rules: { ...rules, blockUnmappedLines: rules.requireMatchedLineItems },
    options: {
      forceApproval: Boolean(body?.force),
      forceTotalsMismatch: Boolean(body?.forceTotalsMismatch),
      hasSupervisorOverride: Boolean(body?.hasSupervisorOverride),
    },
  });

  return NextResponse.json({
    ok: true,
    validation,
    policyBlocked: validation.blocked,
    message: validation.blocked ? "Approval blocked by company policy." : "Ready for approval.",
  });
}
