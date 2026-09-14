import { redirect } from "next/navigation";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

export type WorkspacePageContext = {
  session: WorkspaceSession;
  /** The company of the verified member's workspace — never a request value. */
  companyId: string;
};

/**
 * The gate for a server-rendered workspace page that reads or writes company
 * data. Call it first, before any data is loaded.
 *
 * Server pages render for any request, signed in or not: there is no proxy or
 * layout in front of them. Pages that loaded finance intelligence without a
 * company fell back to a fixed tenant, and several of those loads also insert
 * snapshot / audit rows — so an anonymous page view could read and write
 * company data.
 *
 * In order, and before the page touches anything:
 *   1. authentication — the signed workspace session, backed by an Active
 *      membership (requireWorkspacePermission);
 *   2. authorisation  — the member holds `permission`;
 *   3. company        — resolved from the verified session's workspace record
 *      (resolveApiCompanyId); a conflicting cookie hint resolves to nothing.
 * Nothing from the query string, route, headers or active-client cookie selects
 * the company. The page must pass the returned companyId explicitly.
 *
 * On any failure the request is sent to the workspace sign-in page with a
 * message — the same convention as the developer layout — and no company data
 * is read or written.
 */
export async function requireWorkspacePage(permission: string): Promise<WorkspacePageContext> {
  let context: WorkspacePageContext | null = null;
  let message = "Sign in to your workspace to continue.";

  try {
    const session = await requireWorkspacePermission(permission);
    const companyId = await resolveApiCompanyId();
    if (companyId) {
      context = { session, companyId };
    } else {
      message = "Your workspace company could not be verified. Sign in again.";
    }
  } catch (error) {
    if (error instanceof WorkspaceAccessError && error.status === 403) {
      message = "You do not have access to that page.";
    }
  }

  // redirect() throws, so it is called outside the try block.
  if (!context) redirect(`/login?error=${encodeURIComponent(message)}`);
  return context;
}
