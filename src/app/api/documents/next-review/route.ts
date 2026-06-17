import { NextRequest, NextResponse } from "next/server";
import { getNextReviewDocumentId } from "@/lib/vyron-document-approval-validation";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const after = request.nextUrl.searchParams.get("after") || undefined;
  try {
    const companyId = await requireDocumentTenantId();
    const documentId = await getNextReviewDocumentId(supabase, companyId, after);
    return NextResponse.json({ ok: true, documentId });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Could not find next review document.");
  }
}
