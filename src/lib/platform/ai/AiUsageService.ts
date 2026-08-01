import { AiUsageRepository } from "@/lib/platform/ai/AiUsageRepository";
import { computeCostInCompanyCurrency, computeCostUsd, usdToCredits } from "@/lib/platform/ai/AiUsageCalculator";
import { evaluateAllowanceStatus, resolveTierAllowance } from "@/lib/platform/ai/AiTierEnforcement";
import { resolveCompanyPackage } from "@/lib/platform/entitlement";
import type {
  AiAllowanceCheckResult,
  AiUsageEvent,
  AiUsageRecordInput,
  AiUsageSummary,
} from "@/lib/platform/ai/AiUsageTypes";

function currentPeriod(): { periodStart: Date; periodEnd: Date; periodKey: string } {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return { periodStart, periodEnd, periodKey };
}

/**
 * Company IDs exempt from AI allowance enforcement (platform-owner / dev
 * workspaces). Configured via VYRON_AI_ALLOWANCE_EXEMPT_COMPANY_IDS, a
 * comma-separated list of company UUIDs. Empty by default — enforcement
 * applies to everyone unless explicitly exempted.
 */
function isAllowanceExemptCompany(companyId: string): boolean {
  const raw = process.env.VYRON_AI_ALLOWANCE_EXEMPT_COMPANY_IDS || "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(companyId);
}

export class AiUsageService {
  /**
   * Evaluate a company's AI allowance for the current period.
   *
   * ENTITLEMENT IS RESOLVED FROM THE DATABASE, NEVER FROM THE REQUEST.
   * `packageName` is retained for signature compatibility but is now only a
   * fallback used when the database yields no package at all. It is no longer
   * authoritative, because callers derived it from the client-controlled
   * `vyron_cost_active_client` cookie.
   *
   * Package resolution order:
   *   1. company package from the database (workspace.package_name, then
   *      company.subscription_plan)
   *   2. `package_id_override` from `vyron_ai_company_allowances`, if present
   *   3. numeric overrides (credits / spend / requests), if present
   *
   * Allowance maths, threshold notification, usage recording and exemption
   * logic are unchanged.
   */
  static async checkAllowance(input: { companyId: string; packageName?: string }): Promise<AiAllowanceCheckResult> {
    const { periodStart, periodEnd } = currentPeriod();
    const [rollup, override, resolvedPackage] = await Promise.all([
      AiUsageRepository.getMonthlyRollup(input.companyId, periodStart.toISOString(), periodEnd.toISOString()),
      AiUsageRepository.getAllowanceOverride(input.companyId),
      resolveCompanyPackage(input.companyId, { fallbackPackageName: input.packageName ?? null }),
    ]);

    // Self-heal: guarantee a row exists for this company so future admin
    // overrides and threshold notifications have somewhere to land. Never
    // blocks enforcement on this succeeding.
    void AiUsageRepository.ensureAllowanceRow(input.companyId).catch(() => {});

    // Step 2 — an explicit package override replaces the resolved package.
    // Previously read from the database and then discarded, so an administrator
    // setting it saw no effect.
    const effectivePackageName = override?.packageIdOverride?.trim() || resolvedPackage.packageName;

    // Step 3 — numeric overrides still layer on top of the tier defaults.
    const allowance = resolveTierAllowance(effectivePackageName, {
      monthlyCredits: override?.monthlyCreditsOverride ?? undefined,
      maxSpendUsd: override?.monthlySpendUsdOverride ?? undefined,
      maxRequests: override?.monthlyRequestsOverride ?? undefined,
    });

    const creditsRatio = allowance.monthlyCredits > 0 ? rollup.creditsUsed / allowance.monthlyCredits : rollup.creditsUsed > 0 ? Infinity : 0;
    const spendRatio = allowance.maxSpendUsd > 0 ? rollup.spendUsedUsd / allowance.maxSpendUsd : rollup.spendUsedUsd > 0 ? Infinity : 0;
    const requestsRatio = allowance.maxRequests > 0 ? rollup.requestsUsed / allowance.maxRequests : rollup.requestsUsed > 0 ? Infinity : 0;
    const percentOfLimitUsed = Math.round(Math.min(999, Math.max(creditsRatio, spendRatio, requestsRatio) * 100));

    const exempt = isAllowanceExemptCompany(input.companyId);
    const status = exempt ? "ok" : evaluateAllowanceStatus(percentOfLimitUsed);

    return {
      status,
      allowed: exempt ? true : status !== "exceeded",
      companyId: input.companyId,
      packageId: allowance.packageId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      creditsUsed: rollup.creditsUsed,
      creditsLimit: allowance.monthlyCredits,
      spendUsedUsd: rollup.spendUsedUsd,
      spendLimitUsd: allowance.maxSpendUsd,
      requestsUsed: rollup.requestsUsed,
      requestsLimit: allowance.maxRequests,
      percentOfLimitUsed,
      // Provenance — makes it visible in every response and log which record
      // decided the entitlement, so a wrong package is diagnosable without a
      // database session.
      packageName: effectivePackageName,
      packageSource: override?.packageIdOverride?.trim() ? "allowance.package_id_override" : resolvedPackage.source,
      workspaceId: resolvedPackage.workspaceId,
      packageDivergence: resolvedPackage.divergence,
    };
  }

  static async recordUsage(input: AiUsageRecordInput): Promise<AiUsageEvent | null> {
    const costUsd = computeCostUsd(
      { promptTokens: input.promptTokens, completionTokens: input.completionTokens },
      input.provider,
      input.model
    );
    const companyCurrency = await AiUsageRepository.getCompanyCurrency(input.companyId);
    const costCompanyCurrency = computeCostInCompanyCurrency(costUsd, companyCurrency);
    // packageName is deliberately discarded: it is never persisted and never
    // authoritative. Entitlement is resolved from the database.
    const { packageName, ...eventInput } = input;
    void packageName;

    const event = await AiUsageRepository.insertUsageEvent({
      ...eventInput,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata || {},
      estimatedCostUsd: costUsd,
      estimatedCostCompanyCurrency: costCompanyCurrency,
      companyCurrency,
    });

    void this.maybeNotifyThresholds(input.companyId);

    return event;
  }

  private static async maybeNotifyThresholds(companyId: string): Promise<void> {
    try {
      const { periodKey } = currentPeriod();
      const [override, check] = await Promise.all([
        AiUsageRepository.getAllowanceOverride(companyId),
        this.checkAllowance({ companyId }),
      ]);

      if (check.percentOfLimitUsed >= 95 && override?.lastNotified95Period !== periodKey) {
        await AiUsageRepository.markThresholdNotified(companyId, 95, periodKey);
      } else if (check.percentOfLimitUsed >= 80 && override?.lastNotified80Period !== periodKey) {
        await AiUsageRepository.markThresholdNotified(companyId, 80, periodKey);
      }
    } catch (error) {
      console.error("[ai-usage] threshold notification bookkeeping failed", error);
    }
  }

  /** `packageName` is a fallback only — entitlement resolves from the database. */
  static async getUsageSummary(companyId: string, packageName?: string): Promise<AiUsageSummary> {
    const { periodStart, periodEnd } = currentPeriod();
    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();

    const [allowance, companyCurrency, topFeatures, topUsers, dailyUsage] = await Promise.all([
      this.checkAllowance({ companyId, packageName }),
      AiUsageRepository.getCompanyCurrency(companyId),
      AiUsageRepository.getTopFeatures(companyId, startIso, endIso),
      AiUsageRepository.getTopUsers(companyId, startIso, endIso),
      AiUsageRepository.getDailyUsage(companyId, startIso, endIso),
    ]);

    const estimatedMonthlyCostUsd = allowance.spendUsedUsd;
    const estimatedMonthlyCostCompanyCurrency = computeCostInCompanyCurrency(estimatedMonthlyCostUsd, companyCurrency);

    const now = new Date();
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / 86_400_000));
    const daysInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000);
    const projectedMonthEndCredits = Math.round((allowance.creditsUsed / daysElapsed) * daysInPeriod);

    return {
      companyId,
      companyCurrency,
      allowance,
      estimatedMonthlyCostUsd,
      estimatedMonthlyCostCompanyCurrency,
      projectedMonthEndCredits,
      topFeatures,
      topUsers,
      dailyUsage,
    };
  }

  static async getUsageSummaryByWorkspaceId(workspaceId: string): Promise<AiUsageSummary> {
    const companyId = await AiUsageRepository.resolveCompanyIdForWorkspace(workspaceId);
    if (!companyId) throw new Error("No company resolved for this workspace.");

    // No cookie lookup: the package is resolved from the database by companyId.
    return this.getUsageSummary(companyId);
  }
}
