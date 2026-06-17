import type { NextRequest } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";

export type XeroApiContext = {
  workspaceId?: string | null;
  companyId?: string | null;
  clientId?: string | null;
};

export function xeroContextFromRequest(request: NextRequest, body?: Record<string, unknown>): XeroApiContext {
  return {
    workspaceId:
      request.nextUrl.searchParams.get("workspaceId") ||
      (typeof body?.workspaceId === "string" ? body.workspaceId : null),
    companyId:
      request.nextUrl.searchParams.get("companyId") ||
      (typeof body?.companyId === "string" ? body.companyId : null),
    clientId:
      request.nextUrl.searchParams.get("clientId") ||
      (typeof body?.clientId === "string" ? body.clientId : null),
  };
}

/** Active workspace cookie is the source of truth. Reject mismatched client hints. */
export async function requireXeroWorkspaceContext(ctx?: XeroApiContext) {
  const workspace = await getServerActiveWorkspace();
  if (!workspace?.id) {
    throw new Error("No active workspace. Select a client workspace first.");
  }

  const workspaceId = workspace.id;
  const hintWorkspaceId = ctx?.workspaceId?.trim() || ctx?.clientId?.trim() || null;
  if (hintWorkspaceId && hintWorkspaceId !== workspaceId) {
    throw new Error("Access denied.");
  }

  const companyId = await requireApiCompanyId();
  if (ctx?.companyId?.trim() && ctx.companyId.trim() !== companyId) {
    throw new Error("Access denied.");
  }

  return { workspace, workspaceId, companyId };
}
