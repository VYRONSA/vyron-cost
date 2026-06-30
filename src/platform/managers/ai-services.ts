export type AiServiceId = "cost_intelligence" | "demand_forecasting" | "document_intelligence";

export type AiServiceDefinition = {
  id: AiServiceId;
  label: string;
  featureKey: "cost_intelligence" | "forecasting" | "document_intelligence";
  status: "active" | "planned";
};

export const AI_SERVICE_REGISTRY: AiServiceDefinition[] = [
  {
    id: "cost_intelligence",
    label: "AI Cost Intelligence",
    featureKey: "cost_intelligence",
    status: "active",
  },
  {
    id: "demand_forecasting",
    label: "Demand Forecasting",
    featureKey: "forecasting",
    status: "active",
  },
  {
    id: "document_intelligence",
    label: "Document Intelligence",
    featureKey: "document_intelligence",
    status: "active",
  },
];

export function listAiServices(status?: "active" | "planned") {
  if (!status) return AI_SERVICE_REGISTRY;
  return AI_SERVICE_REGISTRY.filter((row) => row.status === status);
}
