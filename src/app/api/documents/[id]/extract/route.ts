import { NextRequest, NextResponse } from "next/server";
import {
  loadDocumentBytes,
  logExtractionEvent,
  persistExtractionToDocument,
  runDocumentExtraction,
} from "@/lib/vyron-document-extraction";
import {
  documentTenantAccessErrorResponse,
  loadDocumentForTenant,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required for document extraction." },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client unavailable." }, { status: 500 });
  }

  try {
    const tenantId = await requireDocumentTenantId();
    const document = await loadDocumentForTenant<{
      id: string;
      tenant_id: string;
      status: string;
      storage_bucket: string;
      storage_path: string;
      original_filename: string;
      file_mime: string | null;
      file_size_bytes: number | null;
      deleted_at: string | null;
    }>(
      supabase,
      documentId,
      tenantId,
      "id, tenant_id, status, storage_bucket, storage_path, original_filename, file_mime, file_size_bytes, deleted_at"
    );

    if (document.deleted_at) {
      return NextResponse.json({ ok: false, error: `Document ${documentId} was deleted.` }, { status: 404 });
    }

    try {
      await supabase.from("vyron_documents").update({ status: "extracting" }).eq("id", documentId).eq("tenant_id", tenantId);

      const { bytes, mime, fileName, bucket, path } = await loadDocumentBytes(supabase, document);

      console.log("[documents/extract] loaded from storage", {
        documentId,
        fileName,
        mime,
        byteSize: bytes.length,
        bucket,
        path,
      });

      await logExtractionEvent(supabase, documentId, "started", "Downloaded file from storage; calling OpenAI.", {
        fileName,
        mime,
        byteSize: bytes.length,
        bucket,
        path,
      });

      const { extraction, modelUsed, log } = await runDocumentExtraction({ fileName, mime, bytes });

      await persistExtractionToDocument(supabase, documentId, extraction, modelUsed);

      return NextResponse.json({
        ok: true,
        documentId,
        modelUsed,
        extraction,
        log,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed.";

      await supabase
        .from("vyron_documents")
        .update({
          status: "needs_review",
          processing_notes: `AI extraction failed — manual review required. ${message}`.slice(0, 500),
        })
        .eq("id", documentId)
        .eq("tenant_id", tenantId);

      await logExtractionEvent(supabase, documentId, "failed", message, {
        documentId,
        fallbackStatus: "needs_review",
      });

      console.error("[documents/extract] failed — graceful fallback to needs_review", { documentId, message });

      return NextResponse.json({
        ok: true,
        partial: true,
        needsReview: true,
        documentId,
        error: message,
      });
    }
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Extraction failed.");
  }
}
