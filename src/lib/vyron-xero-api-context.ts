import type { NextRequest } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { authorisedWorkspaceId, getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
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
  /*
   * The workspace is the one the caller is a verified member of.
   *
   * This used to be getServerActiveWorkspace().id — the vyron_cost_active_client
   * cookie, which the browser writes and nothing validates. Request hints were
   * checked against that cookie, so they agreed with each other while both
   * disagreed with the database: editing the cookie pointed readConnection and
   * the OAuth URL builder at another tenant's Xero connection.
   *
   * The cookie is now a hint like any other. It is still read, because the rest
   * of the context (the display name) comes from it, but it may not select the
   * tenant, and a cookie naming a different workspace is refused rather than
   * quietly honoured.
   */
  const authorisedId = await authorisedWorkspaceId();
  if (!authorisedId) {
    throw new Error("Workspace session required.");
  }
  const workspaceId = requireUuidIdentifier(authorisedId, "workspace");

  const workspace = await getServerActiveWorkspace();
  if (workspace?.id && requireUuidIdentifier(workspace.id, "workspace") !== workspaceId) {
    throw new Error("Access denied.");
  }
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

  // May be null when no active-client cookie is present. The workspace id above
  // is the authoritative value; this is only the display record.
  return { workspace, workspaceId, companyId };
}
