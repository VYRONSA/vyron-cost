/**
 * The tenant a shared enterprise / procurement / recovery engine call runs
 * against.
 *
 * These helpers used to default to a fixed tenant (the demo sandbox company)
 * whenever a caller did not pass one — and most callers, including server
 * pages that render for anonymous requests, did not. Two of them write, so an
 * anonymous page load could write intelligence rows for that fixed tenant, and
 * a signed-in member was silently answered from it instead of their own
 * company.
 *
 * The engine now runs only for the company of a VERIFIED workspace session
 * (getWorkspaceCompanyId: signed session token -> active membership ->
 * vyron_workspaces.company_id). There is no default:
 *
 *   - no verified session            -> null: the helper returns nothing and
 *                                        writes nothing (fail closed)
 *   - a requested company that is not
 *     the verified one                -> null: refused, never substituted
 *   - otherwise                       -> the verified company
 *
 * A caller-supplied company is therefore a consistency check, never a
 * selector. Preview/demo is not a separate path: the demo sandbox company is
 * returned only when the verified member belongs to a sandbox workspace, which
 * getWorkspaceCompanyId establishes from the verified session.
 *
 * Client-safe: the workspace server helpers are loaded dynamically, as
 * workspaceScope() does. In the browser there is no verified session, so this
 * returns null.
 */
export async function resolveEngineTenant(requested?: string | null): Promise<string | null> {
  const { getWorkspaceCompanyId } = await import("@/lib/vyron-workspace-server");
  const verified = String((await getWorkspaceCompanyId()) || "").trim();
  if (!verified) return null;
  const asked = String(requested ?? "").trim();
  if (asked && asked !== verified) return null;
  return verified;
}
