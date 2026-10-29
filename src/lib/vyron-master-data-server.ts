import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { requireWorkspacePermission, WorkspaceAccessError, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

/*
 * Server-side context for master-data writes (branches, categories, costing
 * lines, recovery recompute) that used to be made from the browser with the
 * public key. Every write: a verified session holding the operation's
 * permission, the member's own company (never a company id the browser
 * sends), and the member's name for the audit record.
 */

/** The Categories screen's own choices. */
export const CATEGORY_TYPES = ["Product", "Ingredient", "Supplier", "Recipe", "Costing", "Report"] as const;
export const CATEGORY_STATUSES = ["Active", "Review", "Inactive"] as const;

export const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MasterDataInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "MasterDataInputError";
    this.status = status;
  }
}

export function masterDataErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof MasterDataInputError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  const response = workspaceAccessErrorResponse(error, fallbackMessage);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function requireMasterDataContext(permission: string): Promise<{ supabase: SupabaseClient; companyId: string; actor: string }> {
  const session = await requireWorkspacePermission(permission);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new WorkspaceAccessError("Supabase unavailable.", 500);
  const companyId = await requireApiCompanyId();
  return { supabase, companyId, actor: await memberDisplayName(supabase, session) };
}

/** A trimmed string of at most `max` characters; empty → null. Anything else is refused. */
export function optionalText(value: unknown, field: string, max = 500): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new MasterDataInputError(`${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new MasterDataInputError(`${field} must be ${max} characters or fewer.`);
  return trimmed || null;
}

export function requiredText(value: unknown, field: string, max = 200): string {
  const text = optionalText(value, field, max);
  if (!text) throw new MasterDataInputError(`${field} is required.`);
  return text;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new MasterDataInputError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function requireId(value: unknown, what: string): string {
  const id = String(value || "");
  if (!UUID_RE.test(id)) throw new MasterDataInputError(`${what} not found.`, 404);
  return id;
}

/**
 * The company's audit register (vyron_cost_audit_log, shown on Audit & Risk):
 * who changed which record. Recorded after the change; a failure to record is
 * logged and does not undo a master-data edit the member already made.
 */
export async function recordMasterDataAudit(
  supabase: SupabaseClient,
  entry: { companyId: string; eventType: string; entityName: string; detail: string; riskLevel?: "Low" | "Medium" | "High" }
) {
  const { error } = await supabase.from("vyron_cost_audit_log").insert({
    company_id: entry.companyId,
    event_type: entry.eventType,
    entity_name: entry.entityName,
    event_detail: entry.detail,
    risk_level: entry.riskLevel || "Low",
  });
  if (error) console.error(`[master-data audit] ${entry.eventType} not recorded: ${error.message}`);
}
