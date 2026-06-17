import { NextRequest, NextResponse } from "next/server";
import { extractStoredDocumentById } from "@/lib/vyron-document-extraction";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
  requireDocumentsForTenant,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const documentIds = Array.isArray(body?.documentIds)
    ? body.documentIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  if (!documentIds.length) {
    return NextResponse.json({ ok: false, error: "No documents selected." }, { status: 400 });
  }

  try {
    const tenantId = await requireDocumentTenantId();
    await requireDocumentsForTenant(supabase, documentIds, tenantId, "id, tenant_id");

    const results: Array<{ documentId: string; ok: boolean; error?: string; modelUsed?: string }> = [];

    for (const documentId of documentIds) {
      try {
        const result = await extractStoredDocumentById(supabase, documentId);
        results.push({ documentId, ok: true, modelUsed: result.modelUsed });
      } catch (error) {
        await supabase
          .from("vyron_documents")
          .update({ status: "extraction_failed" })
          .eq("id", documentId)
          .eq("tenant_id", tenantId);
        results.push({
          documentId,
          ok: false,
          error: error instanceof Error ? error.message : "Extraction failed.",
        });
      }
    }

    const successCount = results.filter((row) => row.ok).length;
    return NextResponse.json({
      ok: true,
      successCount,
      failureCount: results.length - successCount,
      results,
      message: `Extracted ${successCount} of ${results.length} document(s).`,
    });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Bulk extract failed.");
  }
}
