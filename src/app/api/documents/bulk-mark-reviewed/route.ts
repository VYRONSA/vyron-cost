import { NextRequest, NextResponse } from "next/server";
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

    const { error } = await supabase
      .from("vyron_documents")
      .update({
        status: "reviewed",
        processing_notes: "Marked as reviewed (bulk). Ready for approval.",
      })
      .in("id", documentIds)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      count: documentIds.length,
      message: `Marked ${documentIds.length} document(s) as reviewed.`,
    });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Bulk mark reviewed failed.");
  }
}
