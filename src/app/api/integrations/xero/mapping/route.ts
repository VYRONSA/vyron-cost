import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_XERO_ACCOUNT_MAPPING, type XeroAccountMapping } from "@/lib/vyron-xero-integration";
import { requireXeroWorkspaceContext, xeroContextFromRequest } from "@/lib/vyron-xero-api-context";
import { appendXeroAuditEvent } from "@/lib/vyron-xero-connection-store";
import {
  mappingPanelStatus,
  readXeroWorkspaceSettings,
  saveAccountMapping,
  saveSyncConfig,
  type XeroSyncConfig,
} from "@/lib/vyron-xero-mapping";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireWorkspacePermission("xero.view");
    const { workspaceId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request));
    const settings = await readXeroWorkspaceSettings(workspaceId);
    return NextResponse.json({
      ok: true,
      mapping: settings.accounts,
      syncConfig: settings.syncConfig,
      contactMappings: Object.values(settings.contactMappings),
      mappingPanel: mappingPanelStatus(settings),
      invoiceSyncReady: Boolean(settings.accounts.salesAccount?.trim() && settings.accounts.vatStandard?.trim()),
      billSyncReady: Boolean(settings.accounts.costOfSalesAccount?.trim() && settings.accounts.vatStandard?.trim()),
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Mapping load failed.");
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "save-mapping");

  try {
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request, body));
    const actor = String(body.actor || "user");

    if (action === "save-sync-config") {
      await requireWorkspacePermission("xero.mapping.edit");
      const syncConfig = await saveSyncConfig(workspaceId, (body.syncConfig || {}) as Partial<XeroSyncConfig>);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "mapping_updated", actor, companyId, detail: "Xero sync configuration updated." },
        companyId
      );
      return NextResponse.json({ ok: true, syncConfig });
    }

    await requireWorkspacePermission("xero.mapping.edit");
    const mapping = { ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(body.mapping || {}) } as XeroAccountMapping;
    const settings = await saveAccountMapping(workspaceId, mapping);
    await appendXeroAuditEvent(
      workspaceId,
      { event: "mapping_updated", actor, companyId, detail: "Xero account mapping updated." },
      companyId
    );
    return NextResponse.json({
      ok: true,
      mapping: settings.accounts,
      syncConfig: settings.syncConfig,
      mappingPanel: mappingPanelStatus(settings),
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Mapping save failed.");
  }
}
