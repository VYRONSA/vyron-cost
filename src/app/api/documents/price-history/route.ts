import { NextRequest, NextResponse } from "next/server";
import { listPriceHistory, type PriceHistoryScope } from "@/lib/vyron-price-history";
import { getInflationBaseline } from "@/lib/vyron-inflation-baseline";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";

export const runtime = "nodejs";

function parseScope(value: string | null): PriceHistoryScope {
  if (value === "ingredient" || value === "packaging" || value === "product" || value === "supplier") {
    return value;
  }
  return "all";
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const params = request.nextUrl.searchParams;
  try {
    const companyId = await requireDocumentTenantId();
    // The committed inflation baseline applies unless the caller asks for the full history (?history=all).
    const baseline = params.get("history") === "all" ? null : await getInflationBaseline(supabase, companyId);
    const rows = await listPriceHistory(supabase, companyId, {
      excludeBefore: baseline,
      scope: parseScope(params.get("scope")),
      search: params.get("search") || undefined,
      dateFrom: params.get("dateFrom") || undefined,
      dateTo: params.get("dateTo") || undefined,
      supplierName: params.get("supplier") || undefined,
      limit: Number(params.get("limit") || 300),
    });
    return NextResponse.json({ ok: true, rows, inflationBaseline: baseline });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Could not load price history.");
  }
}
