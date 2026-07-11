import { NextRequest, NextResponse } from "next/server";
import { appendXeroAuditEvent, readConnection } from "@/lib/vyron-xero-connection-store";
import { requireXeroWorkspaceContext, xeroContextFromRequest } from "@/lib/vyron-xero-api-context";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  buildFinancialCatalogOptions,
  readCompanyFinancialSettings,
  readFinancialAccountCatalog,
  saveCategoryFinancialMapping,
  saveCompanyFinancialSettings,
  saveProductFinancialOverride,
  syncFinancialAccountCatalogFromXero,
  toCatalogEntryList,
  type FinancialAccountCatalog,
  type FinancialCategoryMapping,
  type FinancialProductOverride,
  type FinancialAccountRecord,
} from "@/lib/vyron-financial-engine";
import { XERO_ACCOUNT_ROLE_LABELS, type XeroAccountRole } from "@/lib/vyron-xero-integration";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type CompanyDefaultAccountRole = Extract<
  XeroAccountRole,
  | "salesAccount"
  | "costOfSalesAccount"
  | "inventoryAssetAccount"
  | "wipAccount"
  | "manufacturingVarianceAccount"
  | "stockAdjustmentAccount"
  | "freightIncomeAccount"
  | "freightExpenseAccount"
>;

const COMPANY_DEFAULT_FIELDS: Array<{
  role: CompanyDefaultAccountRole;
  settingsKey:
    | "defaultSalesAccountId"
    | "defaultCostOfSalesAccountId"
    | "defaultInventoryAssetAccountId"
    | "defaultWipAccountId"
    | "defaultManufacturingVarianceAccountId"
    | "defaultStockAdjustmentAccountId"
    | "defaultFreightIncomeAccountId"
    | "defaultFreightExpenseAccountId";
  label: string;
  required: string;
}> = [
  { role: "salesAccount", settingsKey: "defaultSalesAccountId", label: "Default sales account", required: "Required for invoice exports" },
  { role: "costOfSalesAccount", settingsKey: "defaultCostOfSalesAccountId", label: "Default cost of sales account", required: "Required for bill and COGS flows" },
  { role: "inventoryAssetAccount", settingsKey: "defaultInventoryAssetAccountId", label: "Default inventory asset account", required: "Required for stock valuation" },
  { role: "wipAccount", settingsKey: "defaultWipAccountId", label: "Default WIP account", required: "Optional until WIP journal export is enabled" },
  { role: "manufacturingVarianceAccount", settingsKey: "defaultManufacturingVarianceAccountId", label: "Default manufacturing variance account", required: "Optional until manufacturing variance export is enabled" },
  { role: "stockAdjustmentAccount", settingsKey: "defaultStockAdjustmentAccountId", label: "Default stock adjustment account", required: "Optional until stock adjustment export is enabled" },
  { role: "freightIncomeAccount", settingsKey: "defaultFreightIncomeAccountId", label: "Default freight income account", required: "Optional until freight income export is enabled" },
  { role: "freightExpenseAccount", settingsKey: "defaultFreightExpenseAccountId", label: "Default freight expense account", required: "Optional until freight expense export is enabled" },
];

function normalize(value: unknown) {
  return String(value || "").trim();
}

function pickAccountCode(accountId: string | null | undefined, catalog: FinancialAccountRecord[]) {
  if (!accountId) return null;
  const account = catalog.find((item) => item.id === accountId || item.external_account_id === accountId);
  return account?.account_code || null;
}

function pickAccountId(value: unknown, catalog: FinancialAccountRecord[]) {
  const raw = normalize(value);
  if (!raw) return null;
  const match =
    catalog.find((account) => account.id === raw) ||
    catalog.find((account) => account.external_account_id === raw) ||
    catalog.find((account) => account.account_code === raw);
  return match?.id || null;
}

function pickValidatedAccountId(value: unknown, role: CompanyDefaultAccountRole, catalog: FinancialAccountRecord[]) {
  const raw = normalize(value);
  if (!raw) return null;
  const allowedAccounts = buildFinancialCatalogOptions(catalog, role);
  const match =
    allowedAccounts.find((account) => account.id === raw) ||
    allowedAccounts.find((account) => account.external_account_id === raw) ||
    allowedAccounts.find((account) => account.account_code === raw);
  if (!match) {
    throw new Error(`${XERO_ACCOUNT_ROLE_LABELS[role]} must use a synced active account with a valid account type.`);
  }
  return match.id;
}

function getTaxTypeOptions(catalog: FinancialAccountRecord[]) {
  return Array.from(
    new Set(
      catalog
        .filter((account) => account.status.toUpperCase() === "ACTIVE")
        .map((account) => normalize(account.tax_type))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function buildDefaultsPayload(mapping: Record<string, unknown>, catalog: FinancialAccountRecord[]) {
  const taxTypes = getTaxTypeOptions(catalog);
  const defaultVatTaxType = normalize(mapping.vatStandard) || null;

  if (defaultVatTaxType && !taxTypes.includes(defaultVatTaxType)) {
    throw new Error("Default VAT must use a tax type from the synced local Xero account catalog.");
  }

  return {
    defaultSalesAccountId: pickValidatedAccountId(mapping.salesAccount, "salesAccount", catalog),
    defaultCostOfSalesAccountId: pickValidatedAccountId(mapping.costOfSalesAccount, "costOfSalesAccount", catalog),
    defaultInventoryAssetAccountId: pickValidatedAccountId(mapping.inventoryAssetAccount, "inventoryAssetAccount", catalog),
    defaultWipAccountId: pickValidatedAccountId(mapping.wipAccount, "wipAccount", catalog),
    defaultManufacturingVarianceAccountId: pickValidatedAccountId(mapping.manufacturingVarianceAccount, "manufacturingVarianceAccount", catalog),
    defaultStockAdjustmentAccountId: pickValidatedAccountId(mapping.stockAdjustmentAccount, "stockAdjustmentAccount", catalog),
    defaultFreightIncomeAccountId: pickValidatedAccountId(mapping.freightIncomeAccount, "freightIncomeAccount", catalog),
    defaultFreightExpenseAccountId: pickValidatedAccountId(mapping.freightExpenseAccount, "freightExpenseAccount", catalog),
    defaultVatTaxType,
  };
}

function buildCategoryPayload(mapping: Record<string, unknown>, catalog: FinancialAccountRecord[]): FinancialCategoryMapping {
  const taxTypes = getTaxTypeOptions(catalog);
  const vatTaxType = normalize(mapping.vatStandard) || null;

  if (vatTaxType && !taxTypes.includes(vatTaxType)) {
    throw new Error("Category VAT must use a tax type from the synced local Xero account catalog.");
  }

  return {
    financial_sales_account_id: pickValidatedAccountId(mapping.salesAccount, "salesAccount", catalog),
    financial_cost_of_sales_account_id: pickValidatedAccountId(mapping.costOfSalesAccount, "costOfSalesAccount", catalog),
    financial_inventory_asset_account_id: pickValidatedAccountId(mapping.inventoryAssetAccount, "inventoryAssetAccount", catalog),
    financial_wip_account_id: pickValidatedAccountId(mapping.wipAccount, "wipAccount", catalog),
    financial_manufacturing_variance_account_id: pickValidatedAccountId(mapping.manufacturingVarianceAccount, "manufacturingVarianceAccount", catalog),
    financial_stock_adjustment_account_id: pickValidatedAccountId(mapping.stockAdjustmentAccount, "stockAdjustmentAccount", catalog),
    financial_freight_income_account_id: pickValidatedAccountId(mapping.freightIncomeAccount, "freightIncomeAccount", catalog),
    financial_freight_expense_account_id: pickValidatedAccountId(mapping.freightExpenseAccount, "freightExpenseAccount", catalog),
    financial_vat_tax_type: vatTaxType,
  };
}

function buildProductPayload(mapping: Record<string, unknown>, catalog: FinancialAccountRecord[]): FinancialProductOverride {
  const taxTypes = getTaxTypeOptions(catalog);
  const vatTaxType = normalize(mapping.vatStandard) || null;

  if (vatTaxType && !taxTypes.includes(vatTaxType)) {
    throw new Error("Product VAT must use a tax type from the synced local Xero account catalog.");
  }

  return {
    financial_sales_account_id: pickValidatedAccountId(mapping.salesAccount, "salesAccount", catalog),
    financial_cost_of_sales_account_id: pickValidatedAccountId(mapping.costOfSalesAccount, "costOfSalesAccount", catalog),
    financial_inventory_asset_account_id: pickValidatedAccountId(mapping.inventoryAssetAccount, "inventoryAssetAccount", catalog),
    financial_vat_tax_type: vatTaxType,
  };
}

function buildMappingFromSettings(settings: Awaited<ReturnType<typeof readCompanyFinancialSettings>>, catalog: FinancialAccountRecord[]) {
  return {
    salesAccount: pickAccountCode(settings.defaultSalesAccountId, catalog) || "",
    costOfSalesAccount: pickAccountCode(settings.defaultCostOfSalesAccountId, catalog) || "",
    inventoryAssetAccount: pickAccountCode(settings.defaultInventoryAssetAccountId, catalog) || "",
    wipAccount: pickAccountCode(settings.defaultWipAccountId, catalog) || "",
    manufacturingVarianceAccount: pickAccountCode(settings.defaultManufacturingVarianceAccountId, catalog) || "",
    stockAdjustmentAccount: pickAccountCode(settings.defaultStockAdjustmentAccountId, catalog) || "",
    freightIncomeAccount: pickAccountCode(settings.defaultFreightIncomeAccountId, catalog) || "",
    freightExpenseAccount: pickAccountCode(settings.defaultFreightExpenseAccountId, catalog) || "",
    vatStandard: settings.defaultVatTaxType || "",
    zeroRated: "",
    exempt: "",
  };
}

function mapCatalog(catalog: FinancialAccountCatalog) {
  return {
    ...catalog,
    source: catalog.accounts.length > 0 ? "xero" : "manual",
    accounts: toCatalogEntryList(catalog.accounts),
  };
}

function buildMappingPanel(settings: Awaited<ReturnType<typeof readCompanyFinancialSettings>>, catalog: FinancialAccountRecord[]) {
  return [
    { label: "Chart of accounts sync", ok: catalog.some((account) => account.status.toUpperCase() === "ACTIVE"), required: "Sync the Xero chart of accounts" },
    ...COMPANY_DEFAULT_FIELDS.map((field) => ({
      label: field.label,
      ok: Boolean(settings[field.settingsKey]),
      required: field.required,
    })),
    { label: "Default VAT", ok: Boolean(settings.defaultVatTaxType), required: "Required for invoice exports" },
  ];
}

function buildCompanyDefaultsResponse(catalog: FinancialAccountCatalog, settings: Awaited<ReturnType<typeof readCompanyFinancialSettings>>) {
  return {
    ok: true,
    accountCatalog: mapCatalog(catalog),
    companySettings: settings,
    mapping: buildMappingFromSettings(settings, catalog.accounts),
    taxTypes: getTaxTypeOptions(catalog.accounts),
    mappingPanel: buildMappingPanel(settings, catalog.accounts),
    invoiceSyncReady: Boolean(settings.defaultSalesAccountId && settings.defaultVatTaxType),
    billSyncReady: Boolean(settings.defaultCostOfSalesAccountId && settings.defaultVatTaxType),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireWorkspacePermission("xero.view");
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request));
    const supabase = getSupabaseAdmin();
    if (!isSupabaseServiceRoleConfigured() || !supabase) {
      return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
    }

    const [catalog, settings] = await Promise.all([
      readFinancialAccountCatalog(workspaceId, companyId, "XERO"),
      readCompanyFinancialSettings(workspaceId, companyId, "XERO"),
    ]);

    return NextResponse.json(buildCompanyDefaultsResponse(catalog, settings));
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Account catalog load failed.");
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "sync-from-xero");

  try {
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request, body));
    const actor = String(body.actor || "user");
    const supabase = getSupabaseAdmin();
    if (!isSupabaseServiceRoleConfigured() || !supabase) {
      return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
    }

    if (action === "sync-from-xero") {
      await requireWorkspacePermission("xero.sync");
      const connection = await readConnection(workspaceId);
      if (!connection.connected) {
        return NextResponse.json({ ok: false, error: "Connect to Xero before syncing accounts." }, { status: 400 });
      }

      const synced = await syncFinancialAccountCatalogFromXero(workspaceId, companyId, { actor, integrationType: "XERO" });
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "account_catalog_synced",
          actor,
          companyId,
          detail: `Synced ${synced.accountCount} Xero account(s).`,
          metadata: { accountCount: synced.accountCount },
        },
        companyId
      );

      const [catalog, settings] = await Promise.all([
        readFinancialAccountCatalog(workspaceId, companyId, "XERO"),
        readCompanyFinancialSettings(workspaceId, companyId, "XERO"),
      ]);

      return NextResponse.json(buildCompanyDefaultsResponse(catalog, settings));
    }

    if (action === "save-defaults") {
      await requireWorkspacePermission("xero.mapping.edit");
      const currentCatalog = await readFinancialAccountCatalog(workspaceId, companyId, "XERO");

      let payload;
      try {
        payload = buildDefaultsPayload((body.mapping || {}) as Record<string, unknown>, currentCatalog.accounts);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Invalid company financial defaults.";
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
      }

      const next = await saveCompanyFinancialSettings(workspaceId, companyId, {
        integrationType: "XERO",
        ...payload,
      });
      await appendXeroAuditEvent(
        workspaceId,
        { event: "mapping_updated", actor, companyId, detail: "Company financial defaults updated." },
        companyId
      );
      return NextResponse.json(buildCompanyDefaultsResponse(currentCatalog, next));
    }

    if (action === "save-category") {
      await requireWorkspacePermission("xero.mapping.edit");

      const categoryName = normalize(body.categoryName);
      if (!categoryName) {
        return NextResponse.json({ ok: false, error: "Category name is required." }, { status: 400 });
      }

      const currentCatalog = await readFinancialAccountCatalog(workspaceId, companyId, "XERO");

      let payload;
      try {
        payload = buildCategoryPayload((body.mapping || {}) as Record<string, unknown>, currentCatalog.accounts);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Invalid category financial mapping.";
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
      }

      await saveCategoryFinancialMapping(companyId, categoryName, payload);
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "mapping_updated",
          actor,
          companyId,
          detail: `Category financial mapping updated for ${categoryName}.`,
          metadata: { target: "category", categoryName },
        },
        companyId
      );

      return NextResponse.json({ ok: true, categoryName, mapping: payload });
    }

    if (action === "save-product") {
      await requireWorkspacePermission("xero.mapping.edit");

      const productId = normalize(body.productId);
      if (!productId) {
        return NextResponse.json({ ok: false, error: "Product ID is required." }, { status: 400 });
      }

      const currentCatalog = await readFinancialAccountCatalog(workspaceId, companyId, "XERO");

      let payload;
      try {
        payload = buildProductPayload((body.mapping || {}) as Record<string, unknown>, currentCatalog.accounts);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Invalid product financial override.";
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
      }

      await saveProductFinancialOverride(companyId, productId, payload);
      await appendXeroAuditEvent(
        workspaceId,
        {
          event: "mapping_updated",
          actor,
          companyId,
          detail: `Product financial override updated for ${productId}.`,
          metadata: { target: "product", productId },
        },
        companyId
      );

      return NextResponse.json({ ok: true, productId, mapping: payload });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Account catalog action failed.");
  }
}
