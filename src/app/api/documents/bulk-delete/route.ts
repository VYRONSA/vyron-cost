import { NextRequest, NextResponse } from "next/server";
import { deleteVyronDocument, type VyronDocumentDeleteRow } from "@/lib/vyron-document-delete";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
  requireDocumentsForTenant,
} from "@/lib/vyron-document-tenant-access";
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

  try {
    const tenantId = await requireDocumentTenantId();
    const documents = await requireDocumentsForTenant<VyronDocumentDeleteRow & { tenant_id: string }>(
      supabase,
      documentIds,
      tenantId,
      "id, tenant_id, storage_bucket, storage_path, deleted_at"
    );

    let deletedCount = 0;
    let softDeletedCount = 0;
    let permanentlyDeletedCount = 0;
    const warnings: string[] = [];

    for (const document of documents) {
      const result = await deleteVyronDocument(supabase, document);
      if (result.error) {
        warnings.push(`${document.id}: ${result.error}`);
        continue;
      }
      if (result.action === "skipped") continue;
      deletedCount += 1;
      if (result.action === "soft_deleted") softDeletedCount += 1;
      if (result.action === "permanently_deleted") permanentlyDeletedCount += 1;
      if (result.storageArchiveWarning) warnings.push(`${document.id}: ${result.storageArchiveWarning}`);
    }

    const message =
      permanentlyDeletedCount > 0 && softDeletedCount === 0
        ? `Permanently removed ${permanentlyDeletedCount} document(s).`
        : softDeletedCount > 0 && permanentlyDeletedCount === 0
          ? `Deleted ${softDeletedCount} document(s) from active queues.`
          : `Deleted ${deletedCount} document(s).`;

    return NextResponse.json({
      ok: true,
      deletedCount,
      softDeletedCount,
      permanentlyDeletedCount,
      message,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Bulk delete failed.");
  }
}
