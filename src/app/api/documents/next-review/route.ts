import { NextRequest, NextResponse } from "next/server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getNextReviewDocumentId } from "@/lib/vyron-document-approval-validation";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const after = request.nextUrl.searchParams.get("after") || undefined;
  try {
    const documentId = await getNextReviewDocumentId(supabase, VYRON_DEFAULT_TENANT_ID, after);
    return NextResponse.json({ ok: true, documentId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not find next review document." },
      { status: 500 }
    );
  }
}
