import { NextRequest, NextResponse } from "next/server";
import {
  loadDocumentBytes,
  logExtractionEvent,
  persistExtractionToDocument,
  runDocumentExtraction,
} from "@/lib/vyron-document-extraction";
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

  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, status, storage_bucket, storage_path, original_filename, file_mime, file_size_bytes, deleted_at")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) {
    return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  }

  if (!document) {
    return NextResponse.json({ ok: false, error: `Document ${documentId} not found.` }, { status: 404 });
  }
  if (document.deleted_at) {
    return NextResponse.json({ ok: false, error: `Document ${documentId} was deleted.` }, { status: 404 });
  }

  try {
    await supabase.from("vyron_documents").update({ status: "extracting" }).eq("id", documentId);

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

    await supabase.from("vyron_documents").update({ status: "extraction_failed" }).eq("id", documentId);

    await logExtractionEvent(supabase, documentId, "failed", message, {
      documentId,
    });

    console.error("[documents/extract] failed", { documentId, message });

    return NextResponse.json({ ok: false, error: message, documentId }, { status: 500 });
  }
}
