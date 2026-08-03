import { NextRequest, NextResponse } from "next/server";
import { getDocumentApprovalRules } from "@/lib/vyron-document-approval-rules";
import { validateDocumentApproval } from "@/lib/vyron-document-approval-validation";
import { parseExtractionQualityRecord } from "@/lib/vyron-extraction-quality";
import { traceEvent } from "@/lib/vyron-workflow-trace";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
  verifyDocumentTenantAccess,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The extraction quality record for a document's most recent successful run.
 *
 * Approval consults it so a failed extraction cannot become inventory cost.
 * Returns null when no record exists — documents extracted before extraction
 * quality shipped are validated on their fields alone, as they always were.
 */
async function loadExtractionQuality(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from('vyron_document_extraction_logs')
    .select('metadata')
    .eq('document_id', documentId)
    .eq('stage', 'extraction')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.metadata || typeof data.metadata !== 'object') {
    traceEvent("QUALITY RECEIVED", documentId, { found: false, reason: error?.message ?? "no successful extraction log" });
    return null;
  }
  const record = parseExtractionQualityRecord((data.metadata as Record<string, unknown>).extractionQuality);
  traceEvent("QUALITY RECEIVED", documentId, {
    found: Boolean(record),
    completenessStatus: record?.completenessStatus ?? null,
    reconciliationStatus: record?.reconciliationStatus ?? null,
    columnMappingFailed: record?.columnMappingFailed ?? null,
    classification: record?.classification ?? null,
    extractedLineCount: record?.extractedLineCount ?? null,
  });
  return record;
}

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
    extractionQuality: await loadExtractionQuality(supabase, documentId),
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
