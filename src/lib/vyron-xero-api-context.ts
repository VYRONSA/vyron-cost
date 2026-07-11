import type { NextRequest } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";

export type XeroApiContext = {
  workspaceId?: string | null;
  companyId?: string | null;
  clientId?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class XeroContextValidationError extends WorkspaceAccessError {
  constructor(message: string) {
    super(message, 400);
    this.name = "XeroContextValidationError";
  }
}

function requireUuidIdentifier(value: string | null | undefined, label: "workspace" | "company") {
  const normalized = String(value || "").trim();
  if (!normalized || !UUID_RE.test(normalized)) {
    throw new XeroContextValidationError(
      `Invalid ${label} reference. Select a valid UUID-scoped workspace and retry.`
    );
  }
  return normalized;
}

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

  const workspaceId = requireUuidIdentifier(workspace.id, "workspace");
  const hintWorkspaceId = ctx?.workspaceId?.trim() || ctx?.clientId?.trim() || null;
  if (hintWorkspaceId) {
    const hintedWorkspaceId = requireUuidIdentifier(hintWorkspaceId, "workspace");
    if (hintedWorkspaceId !== workspaceId) {
      throw new Error("Access denied.");
    }
  }

  const companyId = requireUuidIdentifier(await requireApiCompanyId(), "company");
  if (ctx?.companyId?.trim()) {
    const hintedCompanyId = requireUuidIdentifier(ctx.companyId, "company");
    if (hintedCompanyId !== companyId) {
      throw new Error("Access denied.");
    }
  }

  return { workspace, workspaceId, companyId };
}
