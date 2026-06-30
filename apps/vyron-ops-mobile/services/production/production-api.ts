import { apiClient } from "@/services/api";
import type {
  CompleteProductionPayload,
  ProductionManufacturingStats,
  ProductionPlanningStats,
  ProductionRun,
  StockShortage,
} from "@/types/production";

type RunsListResponse = { ok: boolean; runs?: ProductionRun[]; error?: string };
type RunDetailResponse = { ok: boolean; run?: ProductionRun; error?: string };
type StatsResponse = { ok: boolean; stats?: ProductionManufacturingStats; error?: string };
type PlanningStatsResponse = { ok: boolean; stats?: ProductionPlanningStats; error?: string };
type StockValidationResponse = {
  ok: boolean;
  stockOk?: boolean;
  shortages?: StockShortage[];
  error?: string;
};

const OPERATOR_STATUSES = new Set(["Planned", "Approved", "In Production"]);

export function isOperatorProductionRun(run: ProductionRun) {
  return OPERATOR_STATUSES.has(run.status);
}

export async function fetchProductionQueue(filters?: { status?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "All") params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const query = params.toString();
  const response = await apiClient.get<RunsListResponse>(
    `/api/production/runs${query ? `?${query}` : ""}`
  );
  if (!response.ok) throw new Error(response.error || "Failed to load production runs.");
  return (response.runs || []).filter(isOperatorProductionRun);
}

export async function fetchProductionRunDetail(runId: string) {
  const response = await apiClient.get<RunDetailResponse>(`/api/production/runs/${runId}`);
  if (!response.ok || !response.run) {
    throw new Error(response.error || "Production run not found.");
  }
  return response.run;
}

export async function fetchProductionStockShortages(runId: string) {
  const response = await apiClient.get<StockValidationResponse>(
    `/api/production/runs/${runId}/validate-stock`
  );
  if (!response.ok) return [] as StockShortage[];
  return response.shortages || [];
}

export async function startProductionRun(runId: string, actor?: string) {
  const response = await apiClient.post<RunDetailResponse>(`/api/production/runs/${runId}/start`, {
    actor,
  });
  if (!response.ok || !response.run) throw new Error(response.error || "Start failed.");
  return response.run;
}

export async function completeProductionRun(runId: string, payload: CompleteProductionPayload) {
  const response = await apiClient.post<RunDetailResponse>(
    `/api/production/runs/${runId}/complete`,
    payload
  );
  if (!response.ok || !response.run) throw new Error(response.error || "Complete failed.");
  return response.run;
}

export async function fetchManufacturingStats() {
  const response = await apiClient.get<StatsResponse>("/api/production/stats");
  if (!response.ok) throw new Error(response.error || "Failed to load production stats.");
  return response.stats;
}

export async function fetchProductionPlanningStats() {
  try {
    const response = await apiClient.get<PlanningStatsResponse>("/api/production-planning/stats");
    return response.stats ?? null;
  } catch {
    return null;
  }
}
