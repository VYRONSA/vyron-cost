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

/** Largest body the Order Engine accepts: a 2 MB CSV plus JSON overhead. */
export const MAX_BODY_BYTES = 3 * 1024 * 1024;

/**
 * Read a mutating request's JSON body.
 *
 * Defence in depth on top of the SameSite=Lax session cookie: the body must be
 * declared application/json (a cross-site HTML form cannot send that without a
 * CORS preflight, which this API never grants) and must not exceed
 * MAX_BODY_BYTES. Malformed JSON is a 400, not an empty object.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new OrderEngineError("UNSUPPORTED_MEDIA_TYPE", "Send the request as application/json.");
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new OrderEngineError("PAYLOAD_TOO_LARGE", "The request is too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new OrderEngineError("PAYLOAD_TOO_LARGE", "The request is too large.");
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new OrderEngineError("INVALID_INPUT", "The request body is not valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OrderEngineError("INVALID_INPUT", "The request body must be a JSON object.");
  return body as Record<string, unknown>;
}
