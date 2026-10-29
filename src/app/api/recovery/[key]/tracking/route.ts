import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { saveRecoveryTracking, type RecoveryTrackingInput } from "@/lib/vyron-cost-recovery-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const STATUSES = new Set<string>(["New", "Under Review", "Accepted", "Actioned", "Recovered", "Rejected", "Ignored"]);
const TEXT_FIELDS = ["ownerName", "ownerEmail", "notes", "dueDate", "recoveryDate", "recoveryMethod", "recoveryEvidence"] as const;
const TEXT_MAX = 5000;

function parseTracking(body: unknown): RecoveryTrackingInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.status !== "string" || !STATUSES.has(input.status)) return null;
  const parsed: Record<string, unknown> = { status: input.status };
  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length > TEXT_MAX) return null;
    parsed[field] = value;
  }
  if (input.actionTaken !== undefined && input.actionTaken !== null) {
    if (typeof input.actionTaken !== "boolean") return null;
    parsed.actionTaken = input.actionTaken;
  }
  if (input.actualRecovery !== undefined && input.actualRecovery !== null && input.actualRecovery !== "") {
    const amount = Number(input.actualRecovery);
    if (!Number.isFinite(amount)) return null;
    parsed.actualRecovery = amount;
  }
  return parsed as RecoveryTrackingInput;
}

function decodeKey(rawKey: string) {
  try {
    return decodeURIComponent(String(rawKey || "")).trim();
  } catch {
    return "";
  }
}

/**
 * Update one cost-recovery opportunity's tracking in the signed-in member's own
 * company. The Recovery Status screen used to write this from the browser with
 * the public key; the company came from the key alone and every audit row read
 * "Finance Manager". Now: recovery.manage, a validated body, the member's
 * company only, and "changed by" is the member.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500, headers: NO_STORE });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: NO_STORE });
  try {
    const session = await requireWorkspacePermission("recovery.manage");
    const key = decodeKey((await context.params).key);
    const input = parseTracking(await request.json().catch(() => null));
    if (!key || !input) {
      return NextResponse.json({ ok: false, error: "Invalid tracking update." }, { status: 400, headers: NO_STORE });
    }
    const companyId = await requireApiCompanyId();
    try {
      await saveRecoveryTracking(supabase, companyId, key, input, await memberDisplayName(supabase, session));
    } catch (error) {
      if (error instanceof Error && error.message === "Recovery opportunity not found.") {
        return NextResponse.json({ ok: false, error: error.message }, { status: 404, headers: NO_STORE });
      }
      throw error;
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "Save failed.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
