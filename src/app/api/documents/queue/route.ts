import { NextResponse } from "next/server";
import { getDocumentQueueStats } from "@/lib/vyron-document-intelligence-data";
import { requireDocumentTenantId, documentTenantAccessErrorResponse } from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    const tenantId = await requireDocumentTenantId();
    const queue = await getDocumentQueueStats(supabase, tenantId);
    return NextResponse.json({ ok: true, tenantId, queue });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Could not load processing queue.");
  }
}
