import { apiClient } from "@/services/api";
import type { OperationalAiAlert } from "@/types/supervisor";

export const SUPERVISOR_REFRESH_MS = 30_000;

type CostAiInsightsResponse = {
  ok: boolean;
  dashboard?: {
    topRisks: CostAiInsightRow[];
    allInsights: CostAiInsightRow[];
    stats: {
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      totalInsights: number;
    };
  };
  insights?: CostAiInsightRow[];
  error?: string;
};

type CostAiInsightRow = {
  insight_key: string;
  insight_type: string;
  category: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  title: string;
  problem: string;
  impact: string;
  recommendation: string;
  href: string;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
};

type ExecutionActionsResponse = {
  ok: boolean;
  actions?: ExecutionActionRow[];
  summary?: {
    recommended: number;
    approved: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  error?: string;
};

export type ExecutionActionRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  owner: string;
  status: string;
  due_date: string | null;
  href: string | null;
  created_at: string;
  updated_at: string;
  action_events: Array<{
    id: string;
    type: string;
    label: string;
    detail?: string;
    at: string;
  }>;
};

function insightRoute(insight: CostAiInsightRow): string {
  const href = insight.href || "";
  if (href.includes("store-order") || href.includes("dispatch")) return "/dispatch";
  if (href.includes("production") || href.includes("manufacturing")) return "/production";
  if (href.includes("inventory") || href.includes("stock")) return "/inventory";
  if (href.includes("purchase-order") || href.includes("procurement") || href.includes("receiving")) {
    return "/receiving";
  }
  if (href.includes("picking")) return "/picking";
  return "/inventory/lookup";
}

export async function fetchCostAiInsights() {
  try {
    const response = await apiClient.get<CostAiInsightsResponse>("/api/cost-ai-insights");
    if (!response.ok) return { insights: [] as OperationalAiAlert[], stats: null };
    const rows = response.dashboard?.allInsights ?? response.insights ?? [];
    const insights: OperationalAiAlert[] = rows.slice(0, 12).map((row) => ({
      id: row.insight_key,
      priority: row.priority,
      title: row.title,
      problem: row.problem,
      recommendation: row.recommendation,
      route: insightRoute(row),
    }));
    return { insights, stats: response.dashboard?.stats ?? null };
  } catch {
    return { insights: [] as OperationalAiAlert[], stats: null };
  }
}

export async function fetchExecutionActions() {
  try {
    const response = await apiClient.get<ExecutionActionsResponse>("/api/execution-centre/actions");
    if (!response.ok) return { actions: [] as ExecutionActionRow[], summary: null };
    return { actions: response.actions ?? [], summary: response.summary ?? null };
  } catch {
    return { actions: [] as ExecutionActionRow[], summary: null };
  }
}
