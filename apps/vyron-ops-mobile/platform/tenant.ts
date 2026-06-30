import type { TenantContext } from "@/types";
import { apiClient } from "@/services/api";

export async function resolveTenant(): Promise<TenantContext> {
  try {
    const response = await apiClient.get<{
      ok: boolean;
      workspaceId?: string | null;
      companyId?: string | null;
      workspaceName?: string | null;
      activeClientSummary?: {
        companyName?: string;
        tradingName?: string;
        packageName?: string;
        companyId?: string | null;
        id?: string;
      } | null;
    }>("/api/workspace/status");

    const client = response.activeClientSummary;
    return {
      workspaceId: response.workspaceId ?? client?.id ?? null,
      companyId: response.companyId ?? client?.companyId ?? null,
      companyName: client?.companyName ?? response.workspaceName ?? "Workspace",
      tradingName: client?.tradingName ?? client?.companyName ?? response.workspaceName ?? "Workspace",
      packageName: client?.packageName ?? "Professional",
    };
  } catch {
    return {
      workspaceId: null,
      companyId: null,
      companyName: "Not connected",
      tradingName: "VYRON OPS",
      packageName: "Professional",
    };
  }
}
