import type { AiProviderId } from "@/lib/platform/ai/AiUsageTypes";

// Only OpenAI is wired to a real call site today; the enum exists so future
// features (Ask VYRON on Anthropic, etc.) plug into the same usage pipeline.
export function resolveProviderForModel(model: string): AiProviderId {
  const value = String(model || "").toLowerCase();
  if (value.startsWith("gpt-") || value.startsWith("o1") || value.startsWith("o3") || value.startsWith("o4")) return "openai";
  if (value.startsWith("claude-")) return "anthropic";
  if (value.startsWith("gemini-")) return "google";
  if (value.startsWith("grok-")) return "grok";
  return "openai";
}
