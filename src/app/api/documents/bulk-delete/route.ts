import { NextRequest, NextResponse } from "next/server";
import { VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const documentIds = Array.isArray(body?.documentIds)
    ? body.documentIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  if (!documentIds.length) {
    return NextResponse.json({ ok: false, error: "No documents selected." }, { status: 400 });
  }

  const { data: documents, error: listError } = await supabase
    .from("vyron_documents")
    .select("id, storage_bucket, storage_path, deleted_at")
    .in("id", documentIds);
  if (listError) return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });

  let deletedCount = 0;
  const warnings: string[] = [];

  for (const document of documents || []) {
    if (document.deleted_at) continue;

    if (document.storage_path) {
      const { error: removeError } = await supabase.storage
        .from(document.storage_bucket || VYRON_DOCUMENTS_BUCKET)
        .remove([document.storage_path]);
      if (removeError) warnings.push(`${document.id}: ${removeError.message}`);
    }

    const { error: updateError } = await supabase
      .from("vyron_documents")
      .update({
        deleted_at: new Date().toISOString(),
        status: "deleted",
        processing_notes: "Soft deleted from Document Inbox (bulk).",
      })
      .eq("id", document.id);
    if (updateError) {
      warnings.push(`${document.id}: ${updateError.message}`);
      continue;
    }

    await supabase.from("vyron_document_extraction_logs").insert({
      document_id: document.id,
      stage: "delete",
      status: "deleted",
      model: null,
      message: "Document soft deleted (bulk).",
      metadata: { bulk: true },
    });
    deletedCount += 1;
  }

  return NextResponse.json({
    ok: true,
    deletedCount,
    message: `Deleted ${deletedCount} document(s).`,
    warnings: warnings.length ? warnings : undefined,
  });
}
