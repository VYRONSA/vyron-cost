import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyGroupLink = {
  id: string;
  parentCompanyId: string;
  childCompanyId: string;
  relationshipType: string;
};

/** v1 model: one primary company per workspace; group links prepared for consolidation. */
export async function listCompanyGroupLinks(
  supabase: SupabaseClient,
  parentCompanyId: string
): Promise<CompanyGroupLink[]> {
  const { data } = await supabase
    .from("vyron_company_group_links")
    .select("*")
    .eq("parent_company_id", parentCompanyId);
  return (data || []).map((row) => ({
    id: String(row.id),
    parentCompanyId: String(row.parent_company_id),
    childCompanyId: String(row.child_company_id),
    relationshipType: String(row.relationship_type || "subsidiary"),
  }));
}

export async function getPrimaryCompanyIdForWorkspace(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<string> {
  const { data } = await supabase
    .from("vyron_cost_companies")
    .select("id, group_parent_id")
    .eq("id", workspaceCompanyId)
    .maybeSingle();
  if (!data) return workspaceCompanyId;
  return data.group_parent_id ? String(data.group_parent_id) : String(data.id);
}
