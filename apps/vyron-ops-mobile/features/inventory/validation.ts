import type { AdjustmentReason } from "@/types/inventory";

export type InventoryValidationError = { message: string };

export function validateCountedQty(countedQty: number) {
  const errors: InventoryValidationError[] = [];
  if (countedQty < 0) errors.push({ message: "Counted quantity cannot be negative." });
  return errors;
}

export function validateAdjustment(input: {
  quantityDelta: number;
  reason?: AdjustmentReason | null;
}) {
  const errors: InventoryValidationError[] = [];
  if (!input.quantityDelta || input.quantityDelta === 0) {
    errors.push({ message: "Enter a non-zero adjustment quantity." });
  }
  if (!input.reason) errors.push({ message: "Select an adjustment reason." });
  return errors;
}

export function validateTransfer(input: {
  fromStockItemId?: string;
  toStockItemId?: string;
  quantity: number;
  availableQty: number;
}) {
  const errors: InventoryValidationError[] = [];
  if (!input.fromStockItemId || !input.toStockItemId) {
    errors.push({ message: "Select source and destination stock items." });
  }
  if (input.fromStockItemId === input.toStockItemId) {
    errors.push({ message: "Source and destination must be different." });
  }
  if (input.quantity <= 0) errors.push({ message: "Transfer quantity must be greater than zero." });
  if (input.quantity > input.availableQty + 0.0001) {
    errors.push({ message: "Cannot transfer more than available stock." });
  }
  return errors;
}
