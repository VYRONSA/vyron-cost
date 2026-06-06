import { NextRequest, NextResponse } from "next/server";
import { VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  }

  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, storage_bucket, storage_path, deleted_at")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  if (document.deleted_at) return NextResponse.json({ ok: true, alreadyDeleted: true });

  let storageArchived = false;
  let storageArchiveWarning: string | null = null;
  if (document.storage_path) {
    const { error: removeError } = await supabase.storage
      .from(document.storage_bucket || VYRON_DOCUMENTS_BUCKET)
      .remove([document.storage_path]);
    if (removeError) {
      storageArchiveWarning = removeError.message;
    } else {
      storageArchived = true;
    }
  }

  const { error: updateError } = await supabase
    .from("vyron_documents")
    .update({
      deleted_at: new Date().toISOString(),
      status: "deleted",
      processing_notes: "Soft deleted from Document Inbox.",
    })
    .eq("id", documentId);
  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });

  await supabase.from("vyron_document_extraction_logs").insert({
    document_id: documentId,
    stage: "delete",
    status: "deleted",
    model: null,
    message: "Document soft deleted from inbox.",
    metadata: {
      storageArchived,
      storageArchiveWarning,
    },
  });

  return NextResponse.json({
    ok: true,
    softDeleted: true,
    storageArchived,
    storageArchiveWarning,
  });
}

