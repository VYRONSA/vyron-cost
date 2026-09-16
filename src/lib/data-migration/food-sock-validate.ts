/**
 * VYRON — post-import reconciliation of a Food Sock scope.
 *
 * Compares, record by record, the scope an import was meant to write (the
 * plan built for an empty tenant) with a plan rebuilt against the tenant as it
 * is now. A record is PRESENT only when the rebuilt plan matches it to an
 * existing row by the executor's own identity rules; anything else — still to
 * create, an exception, or no longer planned — is MISSING, with its reason.
 * Two scope records resolving to the same row are reported as a collision.
 *
 * Pure: no database access. Row counts are checked separately by the caller.
 */
import type { PlanItem } from "@/lib/data-migration/core";
import type { FoodSockPlan } from "@/lib/data-migration/food-sock-plan";
import { selectExecutionItems, type ExecutionScope } from "@/lib/data-migration/food-sock-execute";

export type MissingRecord = { sourceKey: string; action: PlanItem["action"] | "absent"; detail: string };
export type StageReconciliation = {
  expected: number;
  present: number;
  missing: MissingRecord[];
  collisions: { targetId: string; sourceKeys: string[] }[];
};
export type ScopeReconciliation = {
  scope: ExecutionScope;
  stages: Record<string, StageReconciliation>;
  ok: boolean;
};

export function reconcileImportedScope(expectedPlan: FoodSockPlan, currentPlan: FoodSockPlan, scope: ExecutionScope): ScopeReconciliation {
  const expected = selectExecutionItems(expectedPlan, scope);
  const stages: Record<string, StageReconciliation> = {};
  let ok = true;
  for (const [stage, items] of Object.entries(expected)) {
    const current = new Map(currentPlan.stages[stage as keyof FoodSockPlan["stages"]].items.map((item) => [item.sourceKey, item]));
    const result: StageReconciliation = { expected: items.length, present: 0, missing: [], collisions: [] };
    const byTarget = new Map<string, string[]>();
    for (const item of items) {
      const now = current.get(item.sourceKey);
      if (now?.action === "match" && now.targetId) {
        result.present += 1;
        byTarget.set(now.targetId, [...(byTarget.get(now.targetId) || []), item.sourceKey]);
        continue;
      }
      const reasons = (now?.issues || []).filter((i) => i.severity !== "warning").map((i) => `${i.code}: ${i.message}`);
      result.missing.push({
        sourceKey: item.sourceKey,
        action: now?.action ?? "absent",
        detail: !now ? "No longer in the plan." : now.action === "create" ? "Not found in the tenant; a run would create it." : reasons.join(" | ") || `Planned as ${now.action}.`,
      });
    }
    for (const [targetId, sourceKeys] of byTarget) if (sourceKeys.length > 1) result.collisions.push({ targetId, sourceKeys: sourceKeys.sort() });
    if (result.missing.length || result.collisions.length) ok = false;
    stages[stage] = result;
  }
  return { scope, stages, ok };
}
