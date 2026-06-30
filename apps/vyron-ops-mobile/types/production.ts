/** API response shapes — presentation only, no business rules. */

import type { OpsTaskPriority } from "./receiving";

export type ProductionRunLine = {
  id: string;
  line_type: string;
  ingredient_id: string | null;
  stock_item_id: string | null;
  line_name: string;
  unit: string;
  planned_qty: number;
  actual_qty: number;
  unit_cost: number;
  planned_value: number;
  actual_value: number;
};

export type ProductionRun = {
  id: string;
  run_number: string;
  bom_name_snapshot: string;
  product_name_snapshot: string | null;
  status: string;
  planned_qty: number;
  actual_qty: number;
  yield_pct: number;
  wastage_pct: number;
  planned_cost: number;
  actual_cost: number;
  cost_per_unit: number;
  production_efficiency_pct: number;
  notes: string | null;
  started_by: string | null;
  completed_by: string | null;
  approved_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  lines?: ProductionRunLine[];
};

export type ProductionManufacturingStats = {
  productionToday: number;
  activeRuns: number;
  completedRuns: number;
  productionEfficiency: number;
};

export type ProductionPlanningStats = {
  productionRequiredToday: number;
  productionRunsOpen: number;
  rawMaterialShortages: number;
};

export type StockShortage = {
  ingredient: string;
  lineType: string;
  required: number;
  available: number;
  shortfall: number;
  unit: string;
};

export type ProductionOpsTaskType =
  | "start_production_run"
  | "resume_production_run"
  | "complete_production_run"
  | "record_wastage";

export type ProductionOpsTask = {
  id: string;
  type: ProductionOpsTaskType;
  title: string;
  productionRunId: string;
  runNumber: string;
  productName: string;
  status: string;
  priority: OpsTaskPriority;
  plannedQty: number;
  producedQty: number;
  productionDate: string | null;
};

export type WastageDraft = {
  id: string;
  waste_category: string;
  line_name: string;
  waste_qty: number;
  waste_value: number;
  waste_reason: string;
};

export type CompleteProductionPayload = {
  actual_qty: number;
  wastage?: Array<{
    waste_category: string;
    line_name: string;
    waste_qty: number;
    waste_value: number;
    waste_reason: string;
  }>;
  completed_by?: string;
};

export type ProductionSummary = {
  planned: number;
  produced: number;
  remaining: number;
  wastage: number;
  yieldPct: number;
  estimatedCost: number;
};
