import { NextRequest, NextResponse } from "next/server";
import { VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function GET(_request: NextRequest, context: RouteContext) {
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
    .select("id, storage_bucket, storage_path, original_filename, file_mime, deleted_at")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) {
    return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  }
  if (!document) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }
  if (document.deleted_at) {
    return NextResponse.json({ ok: false, error: "Document was deleted." }, { status: 404 });
  }

  const bucket = (document.storage_bucket as string) || VYRON_DOCUMENTS_BUCKET;
  const path = document.storage_path as string | null;
  if (!path) {
    return NextResponse.json(
      { ok: false, error: "Document has no storage_path — file was not stored in Supabase Storage." },
      { status: 404 }
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signError?.message || "Could not create signed preview URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    previewUrl: signed.signedUrl,
    fileName: (document.original_filename as string) || path.split("/").pop() || "document",
    fileMime: (document.file_mime as string) || "application/octet-stream",
    storageBucket: bucket,
    storagePath: path,
  });
}
