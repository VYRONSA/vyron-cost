import { NextRequest, NextResponse } from "next/server";
import { listDocumentCostAudit } from "@/lib/vyron-document-cost-audit";
import {
  documentTenantAccessErrorResponse,
  loadDocumentForTenant,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    const tenantId = await requireDocumentTenantId();
    await loadDocumentForTenant(supabase, documentId, tenantId, "id, tenant_id");
    const rows = await listDocumentCostAudit(supabase, documentId);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Could not load cost audit.");
  }
}
