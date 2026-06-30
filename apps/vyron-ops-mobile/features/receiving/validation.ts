import type { ReceiveLineDraft, ReceiveSummary } from "@/types/receiving";

export type ReceiveValidationError = {
  lineId?: string;
  message: string;
};

export function buildReceiveDraftFromLines(
  lines: Array<{
    id: string;
    ingredient_name: string;
    quantity: number;
    received_qty: number;
    outstanding_qty: number;
    unit: string;
    unit_cost: number;
  }>
): ReceiveLineDraft[] {
  return lines
    .filter((line) => line.outstanding_qty > 0)
    .map((line) => ({
      lineId: line.id,
      ingredientName: line.ingredient_name,
      orderedQty: line.quantity,
      receivedQty: line.received_qty,
      outstandingQty: line.outstanding_qty,
      unit: line.unit,
      unitCost: line.unit_cost,
      receiveQty: 0,
      skipped: false,
    }));
}

export function validateReceiveDraft(draft: ReceiveLineDraft[]): ReceiveValidationError[] {
  const errors: ReceiveValidationError[] = [];
  const activeLines = draft.filter((line) => !line.skipped);

  if (!activeLines.length) {
    errors.push({ message: "Select at least one line to receive or use Receive Full." });
    return errors;
  }

  const hasQuantity = activeLines.some((line) => line.receiveQty > 0);
  if (!hasQuantity) {
    errors.push({ message: "Enter a receive quantity for at least one line." });
  }

  for (const line of activeLines) {
    if (line.receiveQty < 0) {
      errors.push({ lineId: line.lineId, message: `${line.ingredientName}: quantity cannot be negative.` });
    }
    if (line.receiveQty > line.outstandingQty + 0.0001) {
      errors.push({
        lineId: line.lineId,
        message: `${line.ingredientName}: cannot receive more than outstanding (${line.outstandingQty} ${line.unit}).`,
      });
    }
  }

  return errors;
}

export function buildReceiveSummary(draft: ReceiveLineDraft[]): ReceiveSummary {
  const active = draft.filter((line) => !line.skipped && line.receiveQty > 0);
  const totalQuantity = active.reduce((sum, line) => sum + line.receiveQty, 0);
  const estimatedValue = active.reduce((sum, line) => sum + line.receiveQty * line.unitCost, 0);
  const outstandingQuantity = draft
    .filter((line) => !line.skipped)
    .reduce((sum, line) => sum + Math.max(line.outstandingQty - line.receiveQty, 0), 0);

  return {
    totalLines: active.length,
    totalQuantity: Math.round(totalQuantity * 10000) / 10000,
    outstandingQuantity: Math.round(outstandingQuantity * 10000) / 10000,
    estimatedValue: Math.round(estimatedValue * 100) / 100,
  };
}

export function toReceiptPayload(draft: ReceiveLineDraft[]) {
  const lines = draft
    .filter((line) => !line.skipped && line.receiveQty > 0)
    .map((line) => ({ line_id: line.lineId, receive_qty: line.receiveQty }));

  const allFull = draft
    .filter((line) => !line.skipped)
    .every((line) => Math.abs(line.receiveQty - line.outstandingQty) < 0.0001);

  if (allFull && lines.length === draft.filter((l) => !l.skipped).length) {
    return { mode: "full" as const };
  }

  return { mode: "partial" as const, lines };
}
