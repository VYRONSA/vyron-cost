import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const documentIds = Array.isArray(body?.documentIds)
    ? body.documentIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const force = Boolean(body?.force);

  if (!documentIds.length) {
    return NextResponse.json({ ok: false, error: "No documents selected." }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const results: Array<{ documentId: string; ok: boolean; error?: string }> = [];

  for (const documentId of documentIds) {
    try {
      const response = await fetch(`${origin}/api/documents/${documentId}/review/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, forceTotalsMismatch: force }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        results.push({ documentId, ok: false, error: data.error || "Approval failed." });
      } else {
        results.push({ documentId, ok: true });
      }
    } catch (error) {
      results.push({
        documentId,
        ok: false,
        error: error instanceof Error ? error.message : "Approval request failed.",
      });
    }
  }

  const successCount = results.filter((row) => row.ok).length;
  return NextResponse.json({
    ok: true,
    successCount,
    failedCount: results.length - successCount,
    results,
    message: `Approved ${successCount} of ${results.length} document(s).`,
  });
}
