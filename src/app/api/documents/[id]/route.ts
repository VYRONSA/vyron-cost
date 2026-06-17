import { NextRequest, NextResponse } from "next/server";
import { deleteVyronDocument, type VyronDocumentDeleteRow } from "@/lib/vyron-document-delete";
import {
  documentTenantAccessErrorResponse,
  loadDocumentForTenant,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";
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

  try {
    const tenantId = await requireDocumentTenantId();
    const document = await loadDocumentForTenant<VyronDocumentDeleteRow & { tenant_id: string }>(
      supabase,
      documentId,
      tenantId,
      "id, tenant_id, storage_bucket, storage_path, deleted_at"
    );

    const result = await deleteVyronDocument(supabase, document);
    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    if (result.action === "permanently_deleted") {
      return NextResponse.json({ ok: true, permanentlyDeleted: true });
    }

    return NextResponse.json({
      ok: true,
      softDeleted: true,
      storageArchived: result.storageArchived,
      storageArchiveWarning: result.storageArchiveWarning,
    });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Delete failed.");
  }
}
