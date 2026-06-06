import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type TenantLookupResult = {
  tenant: { id: string; name: string } | null;
  error: PostgrestError | null;
  allCompaniesCount: number;
  allCompaniesSample: { id: string; name: string }[];
};

/** Single exact-ID lookup — no fallbacks. */
export async function lookupTenantById(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantLookupResult> {
  const trimmedId = tenantId.trim();

  const all = await supabase.from("vyron_cost_companies").select("id, name").limit(20);

  const exact = await supabase
    .from("vyron_cost_companies")
    .select("id, name")
    .eq("id", trimmedId)
    .maybeSingle();

  return {
    tenant: exact.data,
    error: exact.error,
    allCompaniesCount: all.data?.length ?? 0,
    allCompaniesSample: all.data ?? [],
  };
}
