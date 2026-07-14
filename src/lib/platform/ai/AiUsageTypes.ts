import type { PackageId, VyronProductId } from "@/platform/managers/package-manager";

export type AiProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "azure_openai"
  | "aws_bedrock"
  | "grok"
  | "ollama";

export type AiFeatureId =
  | "document_intelligence"
  | "ask_vyron"
  | "cost_intelligence"
  | "supplier_intelligence"
  | "manufacturing_intelligence"
  | "executive_decision_centre"
  | "forecasting";

export type AiProductId = VyronProductId;

export type AiUsageRecordInput = {
  companyId: string;
  workspaceId: string | null;
  userId: string | null;
  packageName: string;
  productId: AiProductId;
  featureId: AiFeatureId;
  provider: AiProviderId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  executionTimeMs: number;
  success: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type AiUsageEvent = Omit<AiUsageRecordInput, "packageName"> & {
  id: string;
  estimatedCostUsd: number;
  estimatedCostCompanyCurrency: number;
  companyCurrency: string;
  createdAt: string;
};

export type AiTierAllowance = {
  packageId: PackageId;
  monthlyCredits: number;
  maxSpendUsd: number;
  maxRequests: number;
};

export type AiAllowanceStatus = "ok" | "warning_80" | "warning_95" | "exceeded";

export type AiAllowanceCheckResult = {
  status: AiAllowanceStatus;
  allowed: boolean;
  companyId: string;
  packageId: PackageId;
  periodStart: string;
  periodEnd: string;
  creditsUsed: number;
  creditsLimit: number;
  spendUsedUsd: number;
  spendLimitUsd: number;
  requestsUsed: number;
  requestsLimit: number;
  percentOfLimitUsed: number;
};

export type AiAllowanceExceededError = {
  ok: false;
  error: "AI_ALLOWANCE_EXCEEDED";
  message: string;
  check: AiAllowanceCheckResult;
};

export type AiUsageTopFeature = {
  featureId: AiFeatureId;
  requests: number;
  costUsd: number;
};

export type AiUsageTopUser = {
  userId: string;
  requests: number;
  costUsd: number;
};

export type AiUsageDailyPoint = {
  date: string;
  requests: number;
  costUsd: number;
};

export type AiUsageSummary = {
  companyId: string;
  companyCurrency: string;
  allowance: AiAllowanceCheckResult;
  estimatedMonthlyCostUsd: number;
  estimatedMonthlyCostCompanyCurrency: number;
  projectedMonthEndCredits: number;
  topFeatures: AiUsageTopFeature[];
  topUsers: AiUsageTopUser[];
  dailyUsage: AiUsageDailyPoint[];
};
