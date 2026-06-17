import { NextRequest, NextResponse } from "next/server";
import { listSupplierLineMappings, listSupplierNamesWithMappings } from "@/lib/vyron-supplier-line-learning";
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

  const supplierName = request.nextUrl.searchParams.get("supplier")?.trim() || undefined;
  const includeDisabled = request.nextUrl.searchParams.get("includeDisabled") === "1";

  try {
    const companyId = await requireDocumentTenantId();
    const [suppliers, mappings] = await Promise.all([
      listSupplierNamesWithMappings(supabase, companyId),
      listSupplierLineMappings(supabase, companyId, { supplierName, includeDisabled }),
    ]);
    return NextResponse.json({ ok: true, suppliers, mappings });
  } catch (error) {
    return documentTenantAccessErrorResponse(error, "Could not load supplier mappings.");
  }
}
