/** Mirrors VYRON Platform feature keys — resolved server-side in production. */
export type FeatureKey =
  | "dashboard"
  | "inventory"
  | "procurement"
  | "purchase_orders"
  | "manufacturing"
  | "production_planning"
  | "store_ordering"
  | "dispatch_board"
  | "forecasting"
  | "cost_intelligence";

export function hasFeature(_packageName: string, _feature: FeatureKey): boolean {
  // Sprint 1 placeholder — delegates to platform API in Sprint 2.
  return true;
}
