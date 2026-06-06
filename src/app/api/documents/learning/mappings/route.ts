import { NextRequest, NextResponse } from "next/server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { listSupplierLineMappings, listSupplierNamesWithMappings } from "@/lib/vyron-supplier-line-learning";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const supplierName = request.nextUrl.searchParams.get("supplier")?.trim() || undefined;
  const includeDisabled = request.nextUrl.searchParams.get("includeDisabled") === "1";

  try {
    const [suppliers, mappings] = await Promise.all([
      listSupplierNamesWithMappings(supabase, VYRON_DEFAULT_TENANT_ID),
      listSupplierLineMappings(supabase, VYRON_DEFAULT_TENANT_ID, { supplierName, includeDisabled }),
    ]);
    return NextResponse.json({ ok: true, suppliers, mappings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load supplier mappings." },
      { status: 500 }
    );
  }
}
