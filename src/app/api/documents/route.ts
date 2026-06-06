import { NextRequest, NextResponse } from "next/server";
import { type DocumentListView, listDocumentsForView } from "@/lib/vyron-document-intelligence-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

function parseView(value: string | null): DocumentListView {
  if (
    value === "needs-review" ||
    value === "approved-today" ||
    value === "archive" ||
    value === "deleted"
  ) {
    return value;
  }
  return "inbox";
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  }

  const view = parseView(request.nextUrl.searchParams.get("view"));
  const filters = {
    search: request.nextUrl.searchParams.get("search") || undefined,
    month: request.nextUrl.searchParams.get("month") || undefined,
    year: request.nextUrl.searchParams.get("year") || undefined,
    supplier: request.nextUrl.searchParams.get("supplier") || undefined,
    status: request.nextUrl.searchParams.get("status") || undefined,
  };

  try {
    const documents = await listDocumentsForView(supabase, view, undefined, filters);
    return NextResponse.json({ ok: true, view, documents });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load documents." },
      { status: 500 }
    );
  }
}
