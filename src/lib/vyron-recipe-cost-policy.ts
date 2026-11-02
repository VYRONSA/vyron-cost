import type { SupabaseClient } from "@supabase/supabase-js";
import { convertCostPerUnit, decideLineCostReplacement, normaliseUnit } from "@/lib/vyron-actual-cost";

/**
 * Recipe (BOM) line costs come from the verified supplier cost, not from what
 * was typed.
 *
 * An ingredient line's unit cost is the ingredient's usable cost (its invoiced
 * purchase cost divided by yield — true_unit_cost) converted from the purchase
 * unit into the line's unit: R14/kg flour at 80% yield is R0.0175 per g on a
 * gram line. The recipe editor used to save whatever cost the browser sent, so
 * a cost per kg typed on a gram line (1000× too high), or any hand-typed cost,
 * replaced the supplier cost.
 *
 *   - A line whose unit cannot be converted from the purchase unit (kg ↔ each,
 *     kg ↔ ml) is refused with a message saying what to use.
 *   - A typed cost that differs from the verified cost is replaced by it, and
 *     the correction is reported back — when it is within 0.5×–2× of it, or is
 *     the per-purchase-unit cost typed on a smaller-unit line (per kg on a g
 *     line). Anything further apart (a per-piece cost on a pack-unit line, as
 *     production recipes hold for jars and yeast) is kept, reported as "held"
 *     and audited, so a pack price is never pushed into a recipe.
 *   - A typed cost is kept only with an override reason from a member holding
 *     boms.cost_override; the override is written to the audit log.
 *   - An ingredient with no verified cost yet keeps the typed cost.
 */
export const BOM_COST_OVERRIDE_PERMISSION = "boms.cost_override";

export class RecipeCostUnitError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "RecipeCostUnitError";
  }
}

export type RecipeCostCorrection = {
  lineName: string;
  unit: string;
  suppliedCost: number;
  verifiedCost: number;
  action: "corrected" | "overridden" | "held";
  reason?: string;
};

/** What the caller may do, and where corrections are reported. */
export type RecipeCostPolicy = {
  canOverride: boolean;
  actor: string;
  corrections: RecipeCostCorrection[];
};

type CostedLine = {
  ingredient_id?: string | null;
  child_bom_id?: string | null;
  line_name?: string;
  unit?: string | null;
  unit_cost?: number | null;
  cost_override_reason?: string | null;
};

export async function enforceVerifiedLineCosts<T extends CostedLine>(
  supabase: SupabaseClient,
  companyId: string,
  lines: T[],
  policy?: RecipeCostPolicy
): Promise<T[]> {
  const ids = [...new Set(lines.filter((l) => l.ingredient_id && !l.child_bom_id).map((l) => String(l.ingredient_id)))];
  if (!ids.length) return lines.map(stripReason);
  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("id, ingredient_name, purchase_unit, purchase_cost, true_unit_cost")
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map((data || []).map((i: Record<string, unknown>) => [String(i.id), i]));

  const out: T[] = [];
  const audits: RecipeCostCorrection[] = [];
  const heldAudits: RecipeCostCorrection[] = [];
  for (const line of lines) {
    const ingredient = line.ingredient_id && !line.child_bom_id ? byId.get(String(line.ingredient_id)) : undefined;
    const usable = ingredient ? Number(ingredient.true_unit_cost || ingredient.purchase_cost || 0) : 0;
    if (!ingredient || !(usable > 0)) {
      out.push(stripReason(line));
      continue;
    }
    const purchaseUnit = String(ingredient.purchase_unit || "");
    const lineUnit = String(line.unit || purchaseUnit);
    const verified = convertCostPerUnit(usable, purchaseUnit, lineUnit);
    const name = String(line.line_name || ingredient.ingredient_name || "Line");
    if (verified === null) {
      const p = normaliseUnit(purchaseUnit);
      const options = p === "kg" || p === "g" ? "kg or g" : p === "l" || p === "ml" ? "l or ml" : `"${purchaseUnit}"`;
      throw new RecipeCostUnitError(
        `${name}: ${ingredient.ingredient_name} is bought per ${purchaseUnit}, so a line measured in "${lineUnit}" cannot be costed. Use ${options} for this line, or correct the ingredient's purchase unit.`
      );
    }
    const verifiedCost = Math.round(verified * 100000000) / 100000000;
    const supplied = Number(line.unit_cost || 0);
    const matches = Math.abs(supplied - verifiedCost) <= Math.max(0.0001, verifiedCost * 0.005);
    const reason = String(line.cost_override_reason || "").trim();
    if (matches || !(supplied > 0)) {
      out.push({ ...stripReason(line), unit: lineUnit, unit_cost: verifiedCost });
      continue;
    }
    if (reason && policy?.canOverride) {
      const c = { lineName: name, unit: lineUnit, suppliedCost: supplied, verifiedCost, action: "overridden" as const, reason };
      policy.corrections.push(c);
      audits.push(c);
      out.push({ ...stripReason(line), unit: lineUnit, unit_cost: supplied });
      continue;
    }
    if (decideLineCostReplacement(supplied, verifiedCost, usable) === "hold") {
      const held = { lineName: name, unit: lineUnit, suppliedCost: supplied, verifiedCost, action: "held" as const };
      policy?.corrections.push(held);
      heldAudits.push(held);
      out.push({ ...stripReason(line), unit: lineUnit, unit_cost: supplied });
      continue;
    }
    policy?.corrections.push({ lineName: name, unit: lineUnit, suppliedCost: supplied, verifiedCost, action: "corrected", ...(reason ? { reason: `${reason} (not applied: needs the ${BOM_COST_OVERRIDE_PERMISSION} permission)` } : {}) });
    out.push({ ...stripReason(line), unit: lineUnit, unit_cost: verifiedCost });
  }

  for (const c of audits) {
    await supabase.from("vyron_cost_audit_log").insert({
      company_id: companyId,
      event_type: "BOM Cost Override",
      entity_name: c.lineName,
      event_detail: `${policy?.actor || "Unknown"} kept R${c.suppliedCost} per ${c.unit} instead of the verified supplier cost R${c.verifiedCost} per ${c.unit}. Reason: ${c.reason}`,
      risk_level: "Medium",
    });
  }
  for (const c of heldAudits) {
    await supabase.from("vyron_cost_audit_log").insert({
      company_id: companyId,
      event_type: "BOM Cost Held",
      entity_name: c.lineName,
      event_detail: `Kept R${c.suppliedCost} per ${c.unit}: the verified supplier cost works out at R${c.verifiedCost} per ${c.unit}, more than 2x different. Check the line's unit (a per-piece cost on a pack unit?).`,
      risk_level: "Medium",
    });
  }
  return out;
}

function stripReason<T extends CostedLine>(line: T): T {
  const copy = { ...line };
  delete copy.cost_override_reason;
  return copy;
}
