import { NextRequest, NextResponse } from "next/server";
import { saveProcurementTracking, type ProcurementTrackingInput } from "@/lib/vyron-procurement-ai-data";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const STATUSES = new Set<string>([
  "New",
  "Assigned",
  "Under Review",
  "Accepted",
  "Rejected",
  "Implemented",
  "Closed",
  "Scheduled Review",
]);
const TEXT_FIELDS = ["ownerName", "ownerEmail", "notes", "dueDate", "scheduledReviewDate", "implementationDate", "evidence"] as const;
const AMOUNT_FIELDS = ["expectedBenefit", "actualBenefit"] as const;
const TEXT_MAX = 5000;

function parseTracking(body: unknown): ProcurementTrackingInput | null {
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
  for (const field of AMOUNT_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;
    const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isFinite(amount)) return null;
    parsed[field] = amount;
  }
  return parsed as ProcurementTrackingInput;
}

/**
 * Update the tracking of one procurement recommendation, in the signed-in
 * member's own company.
 *
 * This route used to check no session or permission and wrote whatever it was
 * sent: the tenant came from whichever recommendation carried the key (falling
 * back to a fixed demo tenant), and the audit trail's "changed by" came from
 * the request body. Now: a verified session with purchase_orders.edit, checked
 * first; the body is validated; the recommendation must belong to the member's
 * company — and to no other, because the tracking writer resolves the tenant
 * from the key alone — before anything is written; "changed by" is the
 * member.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  try {
    const session = await requireWorkspacePermission("purchase_orders.edit");

    const { key: rawKey } = await context.params;
    let key = "";
    try {
      key = decodeURIComponent(String(rawKey || "")).trim();
    } catch {
      key = "";
    }
    const input = parseTracking(await request.json().catch(() => null));
    if (!key || !input) {
      return NextResponse.json({ ok: false, error: "Invalid tracking update." }, { status: 400, headers: NO_STORE });
    }

    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "No workspace is active for this session. Sign out and back in, or reopen the workspace." },
        { status: 409, headers: NO_STORE }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase unavailable.");
    const { data, error } = await supabase
      .from("vyron_procurement_recommendations")
      .select("tenant_id")
      .eq("recommendation_key", key);
    if (error) throw new Error(error.message);
    const owners = new Set((data || []).map((row) => String((row as { tenant_id: string }).tenant_id)));
    if (!owners.has(companyId)) {
      return NextResponse.json({ ok: false, error: "Recommendation not found." }, { status: 404, headers: NO_STORE });
    }
    if (owners.size > 1) {
      return NextResponse.json(
        { ok: false, error: "This recommendation cannot be updated safely because its key is not unique." },
        { status: 409, headers: NO_STORE }
      );
    }

    await saveProcurementTracking(key, input, session.userId);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "Save failed.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
