import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerActiveWorkspace,
  getWorkspaceCompanyId,
} from "@/lib/vyron-workspace-server";
import { ensureWorkspaceCompanyDataAligned } from "@/lib/vyron-workspace-company-resolution";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";

export type ApiCompanyContext = {
  workspaceId?: string | null;
  companyId?: string | null;
};

/** Resolve active workspace company for API routes. Never falls back to demo tenant. */
export async function resolveApiCompanyId(): Promise<string | null> {
  return getWorkspaceCompanyId();
}

/** Resolve company from active workspace cookie only. Rejects mismatched client hints. */
export async function resolveApiCompanyIdWithContext(
  supabase: SupabaseClient | null,
  ctx?: ApiCompanyContext
): Promise<string | null> {
  void supabase;
  const resolved = await resolveApiCompanyId();
  if (!resolved) return null;

  const workspace = await getServerActiveWorkspace();
  const ctxCompanyId = ctx?.companyId?.trim() || null;
  const ctxWorkspaceId = ctx?.workspaceId?.trim() || null;

  if (ctxCompanyId && ctxCompanyId !== resolved) return null;
  if (ctxWorkspaceId && workspace?.id && ctxWorkspaceId !== workspace.id) return null;

  return resolved;
}

async function alignWorkspaceCompanyData(companyId: string) {
  if (!isSupabaseServiceRoleConfigured()) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const client = await getServerActiveWorkspace();
  await ensureWorkspaceCompanyDataAligned(supabase, client, companyId);
}

/** Resolve company id and realign legacy rows written under workspace.id when safe. */
export async function resolveAndAlignApiCompanyId(): Promise<string | null> {
  const companyId = await resolveApiCompanyId();
  if (!companyId) return null;
  await alignWorkspaceCompanyData(companyId);
  return companyId;
}

/**
 * The company the signed-in member's workspace actually owns.
 *
 * The company id arrives in a client-writable cookie, so on its own it is a
 * request for a tenant, not proof of one. Editing it let a member of one
 * workspace write rows into another company's data. This resolves the workspace
 * from the verified session and returns the company recorded against it, so the
 * tenant a write lands in is decided by the database.
 *
 * Returns null when there is no verified session — callers then fall back to
 * the previous behaviour rather than newly denying anyone.
 */
async function companyIdForVerifiedSession(): Promise<string | null> {
  if (!isSupabaseServiceRoleConfigured()) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { getServerWorkspaceSession } = await import("@/lib/vyron-workspace-admin-server");
  const session = await getServerWorkspaceSession();
  const workspaceId = session?.workspaceId?.trim();
  if (!workspaceId) return null;

  try {
    const { data } = await supabase
      .from("vyron_workspaces")
      .select("company_id")
      .eq("id", workspaceId)
      .maybeSingle();
    return data?.company_id ? String(data.company_id) : null;
  } catch {
    return null;
  }
}

/** Require an active workspace company for mutating API routes. */
export async function requireApiCompanyId(): Promise<string> {
  const companyId = await resolveApiCompanyId();
  if (!companyId) {
    /*
     * No tenant could be authorised for this caller — an unverifiable session,
     * or a cookie asking for a company its workspace does not own. A typed
     * refusal so routes answer 403 instead of an unhandled 500.
     */
    throw new WorkspaceAccessError("No active workspace company. Sign in to a workspace first.", 403);
  }

  /*
   * A verified session pins the tenant. A cookie asking for a different company
   * than the member's workspace owns is refused outright rather than quietly
   * redirected, because a silent switch would write real data somewhere the
   * caller did not expect.
   */
  const owned = await companyIdForVerifiedSession();
  if (owned && owned !== companyId) {
    // A typed refusal so routes answer 403 rather than an unhandled 500.
    throw new WorkspaceAccessError("Access denied.", 403);
  }

  await alignWorkspaceCompanyData(companyId);
  return companyId;
}

export async function requireWorkspaceContext() {
  const workspace = await getServerActiveWorkspace();
  const companyId = await requireApiCompanyId();
  return {
    workspace,
    workspaceId: workspace?.id || null,
    companyId,
  };
}
