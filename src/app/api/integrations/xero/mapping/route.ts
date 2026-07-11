import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_XERO_ACCOUNT_MAPPING, type XeroAccountMapping } from "@/lib/vyron-xero-integration";
import { requireXeroWorkspaceContext, xeroContextFromRequest } from "@/lib/vyron-xero-api-context";
import { appendXeroAuditEvent } from "@/lib/vyron-xero-connection-store";
import { readCompanyFinancialSettings } from "@/lib/vyron-financial-engine";
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
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request));
    const [settings, companySettings] = await Promise.all([
      readXeroWorkspaceSettings(workspaceId),
      readCompanyFinancialSettings(workspaceId, companyId, "XERO"),
    ]);
    return NextResponse.json({
      ok: true,
      mapping: settings.accounts,
      syncConfig: settings.syncConfig,
      contactMappings: Object.values(settings.contactMappings),
      mappingPanel: mappingPanelStatus(settings),
      invoiceSyncReady: Boolean(companySettings.defaultSalesAccountId && companySettings.defaultVatTaxType),
      billSyncReady: Boolean(companySettings.defaultCostOfSalesAccountId && companySettings.defaultVatTaxType),
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
