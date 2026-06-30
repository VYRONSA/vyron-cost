import type { ProductionSummary, WastageDraft } from "@/types/production";

export type ProductionValidationError = {
  message: string;
};

export function validateProducedQty(qty: number, plannedQty: number): ProductionValidationError[] {
  const errors: ProductionValidationError[] = [];
  if (qty < 0) errors.push({ message: "Produced quantity cannot be negative." });
  if (qty > plannedQty * 2) {
    errors.push({ message: "Produced quantity looks unusually high. Check the entry." });
  }
  return errors;
}

export function validateWastageEntry(entry: Pick<WastageDraft, "waste_qty" | "line_name">): ProductionValidationError[] {
  const errors: ProductionValidationError[] = [];
  if (!entry.line_name.trim()) errors.push({ message: "Select an ingredient or line for wastage." });
  if (entry.waste_qty < 0) errors.push({ message: "Wastage quantity cannot be negative." });
  if (entry.waste_qty === 0) errors.push({ message: "Enter a wastage quantity greater than zero." });
  return errors;
}

export function validateCompleteProduction(producedQty: number, wastage: WastageDraft[]): ProductionValidationError[] {
  const errors: ProductionValidationError[] = [];
  if (producedQty <= 0) {
    errors.push({ message: "Record at least one good unit before completing the run." });
  }
  for (const entry of wastage) {
    if (entry.waste_qty < 0) errors.push({ message: "Wastage quantities cannot be negative." });
  }
  return errors;
}

export function buildProductionSummary(input: {
  plannedQty: number;
  producedQty: number;
  wastage: WastageDraft[];
  estimatedCost: number;
}): ProductionSummary {
  const totalWastage = wastageTotal(input.wastage);
  const remaining = Math.max(input.plannedQty - input.producedQty, 0);
  const yieldPct = input.plannedQty > 0 ? Math.round((input.producedQty / input.plannedQty) * 10000) / 100 : 0;

  return {
    planned: input.plannedQty,
    produced: input.producedQty,
    remaining: Math.round(remaining * 10000) / 10000,
    wastage: Math.round(totalWastage * 10000) / 10000,
    yieldPct,
    estimatedCost: input.estimatedCost,
  };
}

export function wastageTotal(wastage: WastageDraft[]) {
  return wastage.reduce((sum, entry) => sum + entry.waste_qty, 0);
}

export function toCompletePayload(producedQty: number, wastage: WastageDraft[], actor?: string) {
  return {
    actual_qty: producedQty,
    wastage: wastage.map((entry) => ({
      waste_category: entry.waste_category,
      line_name: entry.line_name,
      waste_qty: entry.waste_qty,
      waste_value: entry.waste_value,
      waste_reason: entry.waste_reason,
    })),
    completed_by: actor,
  };
}
