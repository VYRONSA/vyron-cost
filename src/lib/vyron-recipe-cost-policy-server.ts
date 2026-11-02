import { BOM_COST_OVERRIDE_PERMISSION, type RecipeCostPolicy } from "@/lib/vyron-recipe-cost-policy";
import { requireAuditActorName, requireWorkspacePermission, WorkspaceAccessError } from "@/lib/vyron-workspace-access";

/**
 * The recipe cost policy for the signed-in member: whether they may keep a
 * typed cost over the verified supplier cost (boms.cost_override, checked
 * against the database on this request), and who to name in the audit log.
 */
export async function recipeCostPolicyForRequest(): Promise<RecipeCostPolicy> {
  let canOverride = false;
  try {
    await requireWorkspacePermission(BOM_COST_OVERRIDE_PERMISSION);
    canOverride = true;
  } catch (error) {
    if (!(error instanceof WorkspaceAccessError)) throw error;
  }
  let actor = "Unknown member";
  try {
    actor = await requireAuditActorName();
  } catch {
    /* the route's own permission check has already authorised the request */
  }
  return { canOverride, actor, corrections: [] };
}
