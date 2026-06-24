import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveClient } from "@/lib/vyron-developer-client";
import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";
import { HANDCRAFTED_DEMO_WORKSPACE_IDS } from "@/lib/vyron-workspace-context";

const COMPANY_SCOPED_TABLES = [
  "vyron_contacts",
  "vyron_customers",
  "vyron_cost_suppliers",
  "vyron_cost_ingredients",
  "vyron_cost_products",
  "vyron_cost_boms",
  "vyron_cost_categories",
] as const;

export type WorkspaceCompanyResolution = {
  companyId: string | null;
  workspaceId: string | null;
  source: "handcrafted-demo" | "workspace-record" | "client-cookie" | "unresolved";
};

function isHandcraftedSandboxWorkspace(client: ActiveClient): boolean {
  if (HANDCRAFTED_DEMO_WORKSPACE_IDS.has(client.id)) return true;
  if (client.id === HANDCRAFTED_COMPANY_ID) return true;
  return false;
}

export async function lookupWorkspaceCompanyIdFromDatabase(
  workspaceId: string
): Promise<string | null> {
  const { getSupabaseAdmin, isSupabaseServiceRoleConfigured } = await import("@/lib/supabase-server");
  if (!isSupabaseServiceRoleConfigured()) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("vyron_workspaces")
    .select("company_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !data?.company_id) return null;
  return String(data.company_id);
}

export async function resolveActiveWorkspaceCompanyId(
  client: ActiveClient | null
): Promise<WorkspaceCompanyResolution> {
  if (!client?.id) {
    return { companyId: null, workspaceId: null, source: "unresolved" };
  }

  if (client.demoMode === true && isHandcraftedSandboxWorkspace(client)) {
    return {
      companyId: HANDCRAFTED_COMPANY_ID,
      workspaceId: client.id,
      source: "handcrafted-demo",
    };
  }

  const fromDatabase = await lookupWorkspaceCompanyIdFromDatabase(client.id);
  if (fromDatabase) {
    return {
      companyId: fromDatabase,
      workspaceId: client.id,
      source: "workspace-record",
    };
  }

  const cookieCompanyId = client.companyId?.trim() || null;
  if (cookieCompanyId) {
    return {
      companyId: cookieCompanyId,
      workspaceId: client.id,
      source: "client-cookie",
    };
  }

  return {
    companyId: null,
    workspaceId: client.id,
    source: "unresolved",
  };
}

async function countRowsForCompany(supabase: SupabaseClient, table: string, companyId: string) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error) {
    if (error.message.includes("does not exist")) return 0;
    throw new Error(error.message);
  }

  return count || 0;
}

export async function realignCompanyScopedData(
  supabase: SupabaseClient,
  fromCompanyId: string,
  toCompanyId: string
): Promise<{ movedTables: string[]; skipped: boolean; reason?: string }> {
  const source = fromCompanyId.trim();
  const target = toCompanyId.trim();

  if (!source || !target || source === target) {
    return { movedTables: [], skipped: true, reason: "Source and target company are the same." };
  }

  const [sourceContacts, targetContacts] = await Promise.all([
    countRowsForCompany(supabase, "vyron_contacts", source),
    countRowsForCompany(supabase, "vyron_contacts", target),
  ]);

  if (!sourceContacts) {
    return { movedTables: [], skipped: true, reason: "No contact master rows under misaligned company id." };
  }

  if (targetContacts > 0) {
    return {
      movedTables: [],
      skipped: true,
      reason: "Target company already has contact master rows; automatic merge was not performed.",
    };
  }

  const movedTables: string[] = [];
  const now = new Date().toISOString();

  for (const table of COMPANY_SCOPED_TABLES) {
    const sourceCount = await countRowsForCompany(supabase, table, source);
    if (!sourceCount) continue;

    const targetCount = await countRowsForCompany(supabase, table, target);
    if (targetCount > 0) continue;

    const patch: Record<string, unknown> = { company_id: target };
    if (table !== "vyron_contacts") {
      patch.updated_at = now;
    }

    const { error } = await supabase.from(table).update(patch).eq("company_id", source);
    if (error) {
      if (error.message.includes("does not exist")) continue;
      throw new Error(`${table}: ${error.message}`);
    }

    movedTables.push(table);
  }

  return { movedTables, skipped: movedTables.length === 0 };
}

/** Use the company_id that actually holds vyron_contacts for this workspace. */
export async function resolveContactMasterCompanyId(
  supabase: SupabaseClient,
  companyId: string,
  workspaceId: string | null
): Promise<string> {
  const canonical = companyId.trim();
  if (!canonical) return canonical;

  const canonicalCount = await countRowsForCompany(supabase, "vyron_contacts", canonical);
  if (canonicalCount > 0) return canonical;

  const workspace = workspaceId?.trim() || "";
  if (!workspace || workspace === canonical) return canonical;

  const workspaceCount = await countRowsForCompany(supabase, "vyron_contacts", workspace);
  if (workspaceCount > 0) return workspace;

  return canonical;
}

export async function ensureWorkspaceCompanyDataAligned(
  supabase: SupabaseClient,
  client: ActiveClient | null,
  companyId: string
): Promise<{ realigned: boolean; movedTables: string[]; reason?: string }> {
  if (!client?.id) {
    return { realigned: false, movedTables: [], reason: "No active workspace." };
  }

  const workspaceId = client.id.trim();
  const canonicalCompanyId = companyId.trim();

  if (!workspaceId || !canonicalCompanyId) {
    return { realigned: false, movedTables: [], reason: "Workspace or company id missing." };
  }

  if (workspaceId === canonicalCompanyId) {
    return { realigned: false, movedTables: [], reason: "Workspace and company ids already aligned." };
  }

  const [workspaceContacts, canonicalContacts] = await Promise.all([
    countRowsForCompany(supabase, "vyron_contacts", workspaceId),
    countRowsForCompany(supabase, "vyron_contacts", canonicalCompanyId),
  ]);

  if (!workspaceContacts) {
    return { realigned: false, movedTables: [], reason: "No contact master rows under workspace id." };
  }

  if (canonicalContacts > 0) {
    return {
      realigned: false,
      movedTables: [],
      reason: "Canonical company already has contact master rows.",
    };
  }

  const result = await realignCompanyScopedData(supabase, workspaceId, canonicalCompanyId);
  return {
    realigned: result.movedTables.length > 0,
    movedTables: result.movedTables,
    reason: result.reason,
  };
}
