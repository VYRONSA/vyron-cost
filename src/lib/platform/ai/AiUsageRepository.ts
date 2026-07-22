import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import type {
  AiFeatureId,
  AiUsageDailyPoint,
  AiUsageEvent,
  AiUsageTopFeature,
  AiUsageTopUser,
} from "@/lib/platform/ai/AiUsageTypes";

export type AiUsageEventInsert = Omit<AiUsageEvent, "id" | "createdAt">;

export type AiMonthlyRollup = {
  creditsUsed: number;
  spendUsedUsd: number;
  requestsUsed: number;
};

export type AiAllowanceOverrideRow = {
  companyId: string;
  packageIdOverride: string | null;
  monthlyCreditsOverride: number | null;
  monthlySpendUsdOverride: number | null;
  monthlyRequestsOverride: number | null;
  lastNotified80Period: string | null;
  lastNotified95Period: string | null;
};

function toRow(input: AiUsageEventInsert) {
  return {
    company_id: input.companyId,
    workspace_id: input.workspaceId,
    user_id: input.userId,
    product_id: input.productId,
    feature_id: input.featureId,
    provider: input.provider,
    model: input.model,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    total_tokens: input.totalTokens,
    estimated_cost_usd: input.estimatedCostUsd,
    estimated_cost_company_currency: input.estimatedCostCompanyCurrency,
    company_currency: input.companyCurrency,
    execution_time_ms: input.executionTimeMs,
    success: input.success,
    error_message: input.errorMessage || null,
    metadata: input.metadata || {},
  };
}

function fromRow(row: Record<string, unknown>): AiUsageEvent {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    userId: row.user_id ? String(row.user_id) : null,
    productId: row.product_id as AiUsageEvent["productId"],
    featureId: row.feature_id as AiFeatureId,
    provider: row.provider as AiUsageEvent["provider"],
    model: String(row.model),
    promptTokens: Number(row.prompt_tokens || 0),
    completionTokens: Number(row.completion_tokens || 0),
    totalTokens: Number(row.total_tokens || 0),
    estimatedCostUsd: Number(row.estimated_cost_usd || 0),
    estimatedCostCompanyCurrency: Number(row.estimated_cost_company_currency || 0),
    companyCurrency: String(row.company_currency || "ZAR"),
    executionTimeMs: Number(row.execution_time_ms || 0),
    success: Boolean(row.success),
    errorMessage: row.error_message ? String(row.error_message) : null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: String(row.created_at),
  };
}

export class AiUsageRepository {
  private static admin(): SupabaseClient | null {
    if (!isSupabaseServiceRoleConfigured()) return null;
    return getSupabaseAdmin();
  }

  static async insertUsageEvent(input: AiUsageEventInsert): Promise<AiUsageEvent | null> {
    const supabase = this.admin();
    if (!supabase) {
      console.warn("[ai-usage] Supabase not configured; skipping usage event persistence.");
      return null;
    }

    const { data, error } = await supabase.from("vyron_ai_usage_events").insert(toRow(input)).select("*").single();
    if (error) {
      console.error("[ai-usage] Failed to insert usage event", error.message);
      return null;
    }

    return fromRow(data as Record<string, unknown>);
  }

  static async getMonthlyRollup(companyId: string, periodStart: string, periodEnd: string): Promise<AiMonthlyRollup> {
    const supabase = this.admin();
    if (!supabase) return { creditsUsed: 0, spendUsedUsd: 0, requestsUsed: 0 };

    const { data, error } = await supabase
      .from("vyron_ai_usage_events")
      .select("estimated_cost_usd, success")
      .eq("company_id", companyId)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (error || !data) return { creditsUsed: 0, spendUsedUsd: 0, requestsUsed: 0 };

    let spendUsedUsd = 0;
    let requestsUsed = 0;
    for (const row of data as Array<{ estimated_cost_usd: number | null; success: boolean }>) {
      spendUsedUsd += Number(row.estimated_cost_usd || 0);
      requestsUsed += 1;
    }

    return {
      creditsUsed: Math.ceil(spendUsedUsd * 100),
      spendUsedUsd: Math.round(spendUsedUsd * 1_000_000) / 1_000_000,
      requestsUsed,
    };
  }

  static async getTopFeatures(companyId: string, periodStart: string, periodEnd: string, limit = 5): Promise<AiUsageTopFeature[]> {
    const supabase = this.admin();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("vyron_ai_usage_events")
      .select("feature_id, estimated_cost_usd")
      .eq("company_id", companyId)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (error || !data) return [];

    const byFeature = new Map<AiFeatureId, { requests: number; costUsd: number }>();
    for (const row of data as Array<{ feature_id: AiFeatureId; estimated_cost_usd: number | null }>) {
      const entry = byFeature.get(row.feature_id) || { requests: 0, costUsd: 0 };
      entry.requests += 1;
      entry.costUsd += Number(row.estimated_cost_usd || 0);
      byFeature.set(row.feature_id, entry);
    }

    return Array.from(byFeature.entries())
      .map(([featureId, entry]) => ({ featureId, requests: entry.requests, costUsd: Math.round(entry.costUsd * 1_000_000) / 1_000_000 }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, limit);
  }

  static async getTopUsers(companyId: string, periodStart: string, periodEnd: string, limit = 5): Promise<AiUsageTopUser[]> {
    const supabase = this.admin();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("vyron_ai_usage_events")
      .select("user_id, estimated_cost_usd")
      .eq("company_id", companyId)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .not("user_id", "is", null);

    if (error || !data) return [];

    const byUser = new Map<string, { requests: number; costUsd: number }>();
    for (const row of data as Array<{ user_id: string | null; estimated_cost_usd: number | null }>) {
      if (!row.user_id) continue;
      const entry = byUser.get(row.user_id) || { requests: 0, costUsd: 0 };
      entry.requests += 1;
      entry.costUsd += Number(row.estimated_cost_usd || 0);
      byUser.set(row.user_id, entry);
    }

    return Array.from(byUser.entries())
      .map(([userId, entry]) => ({ userId, requests: entry.requests, costUsd: Math.round(entry.costUsd * 1_000_000) / 1_000_000 }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, limit);
  }

  static async getDailyUsage(companyId: string, periodStart: string, periodEnd: string): Promise<AiUsageDailyPoint[]> {
    const supabase = this.admin();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("vyron_ai_usage_events")
      .select("created_at, estimated_cost_usd")
      .eq("company_id", companyId)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (error || !data) return [];

    const byDay = new Map<string, { requests: number; costUsd: number }>();
    for (const row of data as Array<{ created_at: string; estimated_cost_usd: number | null }>) {
      const date = String(row.created_at).slice(0, 10);
      const entry = byDay.get(date) || { requests: 0, costUsd: 0 };
      entry.requests += 1;
      entry.costUsd += Number(row.estimated_cost_usd || 0);
      byDay.set(date, entry);
    }

    return Array.from(byDay.entries())
      .map(([date, entry]) => ({ date, requests: entry.requests, costUsd: Math.round(entry.costUsd * 1_000_000) / 1_000_000 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  static async resolveCompanyIdForWorkspace(workspaceId: string): Promise<string | null> {
    const supabase = this.admin();
    if (!supabase) return null;

    const { data } = await supabase.from("vyron_workspaces").select("company_id").eq("id", workspaceId).maybeSingle();
    const companyId = (data as { company_id?: string } | null)?.company_id;
    return companyId && companyId.trim() ? companyId.trim() : null;
  }

  static async getCompanyCurrency(companyId: string): Promise<string> {
    const supabase = this.admin();
    if (!supabase) return "ZAR";

    const { data } = await supabase.from("vyron_cost_companies").select("currency_code").eq("id", companyId).maybeSingle();
    const currency = (data as { currency_code?: string } | null)?.currency_code;
    return currency && currency.trim() ? currency.trim() : "ZAR";
  }

  static async getAllowanceOverride(companyId: string): Promise<AiAllowanceOverrideRow | null> {
    const supabase = this.admin();
    if (!supabase) return null;

    const { data } = await supabase.from("vyron_ai_company_allowances").select("*").eq("company_id", companyId).maybeSingle();
    if (!data) return null;

    const row = data as Record<string, unknown>;
    return {
      companyId,
      packageIdOverride: row.package_id_override ? String(row.package_id_override) : null,
      monthlyCreditsOverride: row.monthly_credits_override != null ? Number(row.monthly_credits_override) : null,
      monthlySpendUsdOverride: row.monthly_spend_usd_override != null ? Number(row.monthly_spend_usd_override) : null,
      monthlyRequestsOverride: row.monthly_requests_override != null ? Number(row.monthly_requests_override) : null,
      lastNotified80Period: row.last_notified_80_period ? String(row.last_notified_80_period) : null,
      lastNotified95Period: row.last_notified_95_period ? String(row.last_notified_95_period) : null,
    };
  }

  /**
   * Guarantees a row exists for the company so allowance state (threshold
   * notifications, admin overrides) has somewhere to live. Override columns
   * are intentionally left NULL on insert — NULL means "inherit the current
   * package's tier default", resolved live by resolveTierAllowance(). This
   * only inserts; it never touches an existing row's values.
   */
  static async ensureAllowanceRow(companyId: string): Promise<void> {
    const supabase = this.admin();
    if (!supabase) return;

    const { error } = await supabase
      .from("vyron_ai_company_allowances")
      .upsert({ company_id: companyId }, { onConflict: "company_id", ignoreDuplicates: true });

    if (error) {
      console.error("[ai-usage] Failed to ensure allowance row", error.message);
    }
  }

  static async markThresholdNotified(companyId: string, threshold: 80 | 95, period: string): Promise<void> {
    const supabase = this.admin();
    if (!supabase) return;

    const column = threshold === 80 ? "last_notified_80_period" : "last_notified_95_period";
    const atColumn = threshold === 80 ? "last_notified_80_at" : "last_notified_95_at";

    await supabase.from("vyron_ai_company_allowances").upsert(
      {
        company_id: companyId,
        [column]: period,
        [atColumn]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );
  }
}
