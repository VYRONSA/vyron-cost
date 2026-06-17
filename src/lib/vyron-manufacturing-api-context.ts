import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveApiCompanyIdWithContext, type ApiCompanyContext } from "@/lib/vyron-api-workspace";

export function manufacturingCompanyContextFromRequest(
  request: NextRequest,
  body?: Record<string, unknown>
): ApiCompanyContext {
  return {
    workspaceId:
      request.nextUrl.searchParams.get("workspaceId") ||
      (typeof body?.workspaceId === "string" ? body.workspaceId : null),
    companyId:
      request.nextUrl.searchParams.get("companyId") ||
      (typeof body?.companyId === "string" ? body.companyId : null),
  };
}

export async function requireManufacturingCompanyId(
  supabase: SupabaseClient,
  ctx?: ApiCompanyContext
): Promise<string> {
  const companyId = await resolveApiCompanyIdWithContext(supabase, ctx);
  if (!companyId) throw new Error("No active workspace company. Select a client workspace first.");
  return companyId;
}
