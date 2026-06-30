import type { PickLineDraft, PickSummary } from "@/types/store-orders";

export type PickValidationError = {
  lineId?: string;
  message: string;
};

export function buildPickDraftFromLines(
  lines: Array<{
    id: string;
    product_name_snapshot: string;
    quantity: number;
    unit: string;
  }>
): PickLineDraft[] {
  return lines.map((line) => ({
    lineId: line.id,
    productName: line.product_name_snapshot,
    requiredQty: line.quantity,
    pickedQty: 0,
    unit: line.unit,
    skipped: false,
    shortPickReason: null,
    shortPickNote: null,
  }));
}

export function validatePickDraft(draft: PickLineDraft[]): PickValidationError[] {
  const errors: PickValidationError[] = [];
  const active = draft.filter((line) => !line.skipped);

  if (!active.length) {
    errors.push({ message: "Pick at least one line or use Pick Full." });
    return errors;
  }

  const hasPick = active.some((line) => line.pickedQty > 0);
  if (!hasPick) {
    errors.push({ message: "Record a picked quantity for at least one line." });
  }

  for (const line of active) {
    if (line.pickedQty < 0) {
      errors.push({ lineId: line.lineId, message: `${line.productName}: quantity cannot be negative.` });
    }
    if (line.pickedQty > line.requiredQty + 0.0001) {
      errors.push({
        lineId: line.lineId,
        message: `${line.productName}: cannot pick more than required (${line.requiredQty}).`,
      });
    }
    if (line.pickedQty > 0 && line.pickedQty < line.requiredQty && !line.shortPickReason) {
      errors.push({
        lineId: line.lineId,
        message: `${line.productName}: select a short pick reason.`,
      });
    }
  }

  return errors;
}

export function buildPickSummary(draft: PickLineDraft[]): PickSummary {
  const active = draft.filter((line) => !line.skipped);
  const pickedUnits = active.reduce((sum, line) => sum + line.pickedQty, 0);
  const requiredUnits = active.reduce((sum, line) => sum + line.requiredQty, 0);
  const outstanding = active.reduce(
    (sum, line) => sum + Math.max(line.requiredQty - line.pickedQty, 0),
    0
  );
  const shortPicked = active.filter(
    (line) => line.pickedQty > 0 && line.pickedQty < line.requiredQty
  ).length;
  const completionPct =
    requiredUnits > 0 ? Math.round((pickedUnits / requiredUnits) * 10000) / 100 : 0;

  return {
    totalLines: active.length,
    picked: Math.round(pickedUnits * 10000) / 10000,
    outstanding: Math.round(outstanding * 10000) / 10000,
    shortPicked,
    completionPct,
  };
}

export function buildPickingNote(draft: PickLineDraft[]) {
  return JSON.stringify({
    source: "vyron-ops-mobile",
    lines: draft
      .filter((line) => !line.skipped)
      .map((line) => ({
        line_id: line.lineId,
        product_name: line.productName,
        required_qty: line.requiredQty,
        picked_qty: line.pickedQty,
        short_pick_reason: line.shortPickReason,
        short_pick_note: line.shortPickNote,
      })),
  });
}

export function canDispatchOrder(status: string) {
  return status === "ReadyToDispatch";
}

export function canConfirmDelivery(status: string) {
  return status === "Dispatched";
}
