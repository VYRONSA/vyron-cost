import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerActiveWorkspace,
  getWorkspaceCompanyId,
} from "@/lib/vyron-workspace-server";
import { ensureWorkspaceCompanyDataAligned } from "@/lib/vyron-workspace-company-resolution";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

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

/** Require an active workspace company for mutating API routes. */
export async function requireApiCompanyId(): Promise<string> {
  const companyId = await resolveApiCompanyId();
  if (!companyId) throw new Error("No active workspace company. Select a client workspace first.");

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
