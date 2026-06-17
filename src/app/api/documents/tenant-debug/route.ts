import { NextResponse } from "next/server";
import { lookupTenantById } from "@/lib/vyron-document-tenant";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function maskHost(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

export async function GET() {
  const requestedTenantId = await resolveApiCompanyId();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const debug: Record<string, unknown> = {
    supabaseHost: maskHost(url),
    serviceRoleConfigured: isSupabaseServiceRoleConfigured(),
    requestedTenantId,
    requestedTenantIdLength: requestedTenantId?.length ?? 0,
  };

  if (!requestedTenantId) {
    debug.failurePoint = "no_active_workspace";
    console.log("[tenant-debug]", JSON.stringify(debug, null, 2));
    return NextResponse.json({ ok: true, debug });
  }

  if (anonKey && url) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const anonAll = await anon.from("vyron_cost_companies").select("id, name", { count: "exact" });
    const anonExact = await anon.from("vyron_cost_companies").select("id, name").eq("id", requestedTenantId).maybeSingle();
    debug.anonClient = {
      rowCount: anonAll.data?.length ?? 0,
      count: anonAll.count,
      error: anonAll.error?.message ?? null,
      exactFound: Boolean(anonExact.data),
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    debug.failurePoint = "service_role_missing";
    debug.adminClient = null;
    console.log("[tenant-debug]", JSON.stringify(debug, null, 2));
    return NextResponse.json({ ok: false, debug });
  }

  const lookup = await lookupTenantById(admin, requestedTenantId);
  debug.adminClient = {
    allCompaniesCount: lookup.allCompaniesCount,
    allCompaniesSample: lookup.allCompaniesSample,
    exactFound: Boolean(lookup.tenant),
    exactTenant: lookup.tenant,
    queryError: lookup.error?.message ?? null,
  };

  debug.failurePoint = lookup.error
    ? "query_error"
    : !lookup.tenant
      ? lookup.allCompaniesCount === 0
        ? "zero_rows_wrong_project"
        : "uuid_not_in_visible_rows"
      : "none";

  console.log("[tenant-debug]", JSON.stringify(debug, null, 2));

  return NextResponse.json({ ok: true, debug });
}
