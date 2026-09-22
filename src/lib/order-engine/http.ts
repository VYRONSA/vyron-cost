import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";
import { OrderEngineError } from "@/lib/order-engine/errors";
import type { OrderEngineActor } from "@/lib/order-engine/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared route plumbing for the Order Engine API.
 *
 * Order of checks, before any order data is read: service role present →
 * authentication + permission (requireWorkspacePermission) → company from the
 * verified session (requireApiCompanyId). The company is never taken from the
 * request, and the audit actor is never taken from the request body.
 */

export type OrderRouteContext = {
  supabase: SupabaseClient;
  session: WorkspaceSession;
  companyId: string;
  actor: OrderEngineActor;
  can: (permission: string) => boolean;
};

export class ServiceUnavailableError extends Error {}

export function actorFromSession(session: WorkspaceSession): OrderEngineActor {
  const name = [session.firstName, session.surname].filter(Boolean).join(" ").trim();
  return { userId: String(session.userId || "").trim() || "unknown-member", name: name || null };
}

export async function orderRouteContext(permission: string): Promise<OrderRouteContext> {
  if (!isSupabaseServiceRoleConfigured()) throw new ServiceUnavailableError("SUPABASE_SERVICE_ROLE_KEY is required.");
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new ServiceUnavailableError("Supabase unavailable.");
  const session = await requireWorkspacePermission(permission);
  const companyId = await requireApiCompanyId();
  return {
    supabase,
    session,
    companyId,
    actor: actorFromSession(session),
    can: (p: string) => sessionHasPermission(session, p),
  };
}

/** Map any failure onto a JSON response without leaking internals. */
export function orderErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ServiceUnavailableError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (error instanceof OrderEngineError) {
    return NextResponse.json(
      { ok: false, code: error.code, error: error.message, details: error.details ?? null },
      { status: error.status }
    );
  }
  return workspaceAccessErrorResponse(error, fallback);
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
