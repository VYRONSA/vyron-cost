import type { AiProviderId } from "@/lib/platform/ai/AiUsageTypes";

export type AiModelCostRate = { inputPerMillionUsd: number; outputPerMillionUsd: number };

// Public OpenAI list pricing, last verified 2026-07-14. Directional estimate
// only — does not reflect negotiated/volume billing. Update periodically.
const OPENAI_MODEL_RATES: Record<string, AiModelCostRate> = {
  "gpt-4o": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10.0 },
  "gpt-4.1": { inputPerMillionUsd: 2.0, outputPerMillionUsd: 8.0 },
  "gpt-4o-mini": { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  "gpt-4.1-mini": { inputPerMillionUsd: 0.4, outputPerMillionUsd: 1.6 },
};

const PROVIDER_MODEL_RATES: Record<AiProviderId, Record<string, AiModelCostRate>> = {
  openai: OPENAI_MODEL_RATES,
  anthropic: {},
  google: {},
  azure_openai: {},
  aws_bedrock: {},
  grok: {},
  ollama: {},
};

const DEFAULT_RATE: AiModelCostRate = { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10.0 };

export function resolveModelCostRate(provider: AiProviderId, model: string): AiModelCostRate {
  return PROVIDER_MODEL_RATES[provider]?.[model] || DEFAULT_RATE;
}

export function computeCostUsd(
  usage: { promptTokens: number; completionTokens: number },
  provider: AiProviderId,
  model: string
): number {
  const rate = resolveModelCostRate(provider, model);
  const inputCost = (Math.max(0, usage.promptTokens) / 1_000_000) * rate.inputPerMillionUsd;
  const outputCost = (Math.max(0, usage.completionTokens) / 1_000_000) * rate.outputPerMillionUsd;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

// TODO: replace static table with a live FX provider when one is selected.
const FX_RATE_TABLE_USD_TO: Record<string, number> = { ZAR: 18.5, USD: 1 };

export function computeCostInCompanyCurrency(costUsd: number, currencyCode: string): number {
  const rate = FX_RATE_TABLE_USD_TO[currencyCode] ?? 1;
  return Math.round(costUsd * rate * 100) / 100;
}

export function usdToCredits(costUsd: number): number {
  return Math.ceil(Math.max(0, costUsd) * 100);
}
