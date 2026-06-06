import { NextRequest, NextResponse } from "next/server";
import { isSupervisorAuthorized } from "@/lib/vyron-document-approval-audit";
import { rollbackDocumentCostUpdates } from "@/lib/vyron-document-cost-rollback";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const supervisorPin = String(body?.supervisorPin || "");
  const notes = String(body?.notes || "").trim() || null;
  const rolledBackBy = String(body?.rolledBackBy || "supervisor").trim() || "supervisor";

  if (!isSupervisorAuthorized(supervisorPin)) {
    return NextResponse.json({ ok: false, error: "Supervisor authorization required." }, { status: 403 });
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, tenant_id, status")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });

  try {
    const result = await rollbackDocumentCostUpdates(supabase, {
      tenantId: document.tenant_id as string,
      documentId,
      rolledBackBy,
      notes,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Rolled back ${result.reversed} cost update(s). Price history preserved.`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Rollback failed." },
      { status: 400 }
    );
  }
}
