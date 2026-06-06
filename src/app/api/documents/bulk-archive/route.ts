import { NextRequest, NextResponse } from "next/server";
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

  const { data: rows, error: loadError } = await supabase
    .from("vyron_documents")
    .select("id, status")
    .in("id", documentIds)
    .is("deleted_at", null);

  if (loadError) {
    return NextResponse.json({ ok: false, error: loadError.message }, { status: 500 });
  }

  const approvedIds = (rows || []).filter((row) => row.status === "approved").map((row) => String(row.id));
  const skipped = documentIds.length - approvedIds.length;

  if (!approvedIds.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          skipped > 0
            ? "Only approved invoices can be archived. Approve documents first to apply costs and audit trail."
            : "No eligible documents found.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("vyron_documents")
    .update({
      status: "archived",
      archived_at: now,
      processing_notes: "Archived after approval from Document Intelligence.",
    })
    .in("id", approvedIds)
    .eq("status", "approved")
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: approvedIds.length,
    skipped,
    message:
      skipped > 0
        ? `Archived ${approvedIds.length} approved document(s). ${skipped} skipped (not approved).`
        : `Archived ${approvedIds.length} document(s).`,
  });
}
