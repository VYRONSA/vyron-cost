import { apiClient } from "@/services/api";
import type { ScanContext, ScanValidationResult, ScanWorkflow } from "@/types/scanner";

type ValidateResponse = {
  ok: boolean;
  result?: ScanValidationResult;
  error?: string;
};

export async function validateScanOnServer(input: {
  barcode: string;
  workflow: ScanWorkflow;
  context?: ScanContext;
}) {
  const response = await apiClient.post<ValidateResponse>("/api/ops/scan/validate", {
    barcode: input.barcode,
    workflow: input.workflow,
    context: input.context,
  });
  if (!response.ok || !response.result) {
    throw new Error(response.error || "Scan validation failed.");
  }
  return response.result;
}
