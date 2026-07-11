import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getValidXeroAccessToken, xeroApiRequest } from "@/lib/vyron-xero-client";
import {
  XERO_ACCOUNT_ROLE_TYPE_HINTS,
  type XeroAccountCatalogEntry,
  type XeroAccountMapping,
  type XeroAccountRole,
} from "@/lib/vyron-xero-integration";

export type FinancialIntegrationType = "XERO" | "SAGE" | "BUSINESS_CENTRAL" | "SAP" | "NETSUITE" | "QUICKBOOKS";

export type FinancialAccountRecord = {
  id: string;
  workspace_id: string;
  company_id: string;
  integration_type: FinancialIntegrationType;
  external_account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  tax_type: string | null;
  status: string;
  enable_payments: boolean;
  show_in_expense_claims: boolean;
  updated_date: string;
  last_synced: string;
};

export type FinancialAccountCatalog = {
  syncedAt: string | null;
  syncedBy: string | null;
  integrationType: FinancialIntegrationType;
  accounts: FinancialAccountRecord[];
};

export type FinancialCompanySettings = {
  workspaceId: string;
  companyId: string;
  integrationType: FinancialIntegrationType;
  defaultSalesAccountId: string | null;
  defaultCostOfSalesAccountId: string | null;
  defaultInventoryAssetAccountId: string | null;
  defaultWipAccountId: string | null;
  defaultManufacturingVarianceAccountId: string | null;
  defaultStockAdjustmentAccountId: string | null;
  defaultFreightIncomeAccountId: string | null;
  defaultFreightExpenseAccountId: string | null;
  defaultVatTaxType: string | null;
  trackingCategories: Record<string, unknown>;
  updatedAt: string | null;
  lastSynced: string | null;
};

export type FinancialCategoryMapping = {
  financial_sales_account_id?: string | null;
  financial_cost_of_sales_account_id?: string | null;
  financial_inventory_asset_account_id?: string | null;
  financial_wip_account_id?: string | null;
  financial_manufacturing_variance_account_id?: string | null;
  financial_stock_adjustment_account_id?: string | null;
  financial_freight_income_account_id?: string | null;
  financial_freight_expense_account_id?: string | null;
  financial_vat_tax_type?: string | null;
};

export type FinancialProductOverride = FinancialCategoryMapping;

export type FinancialAccountResolutionContext = {
  workspaceId: string;
  companyId: string;
  productId?: string | null;
  productCategory?: string | null;
  categoryName?: string | null;
  integrationType?: FinancialIntegrationType;
};

type AccountRow = Record<string, unknown>;

const ROLE_COLUMN_MAP: Record<Exclude<XeroAccountRole, "vatStandard" | "zeroRated" | "exempt">, keyof FinancialCompanySettings> = {
  salesAccount: "defaultSalesAccountId",
  costOfSalesAccount: "defaultCostOfSalesAccountId",
  inventoryAssetAccount: "defaultInventoryAssetAccountId",
  wipAccount: "defaultWipAccountId",
  packagingAccount: "defaultManufacturingVarianceAccountId",
  manufacturingVarianceAccount: "defaultManufacturingVarianceAccountId",
  stockAdjustmentAccount: "defaultStockAdjustmentAccountId",
  freightIncomeAccount: "defaultFreightIncomeAccountId",
  freightExpenseAccount: "defaultFreightExpenseAccountId",
};

const ROLE_FINANCIAL_COLUMN_MAP: Record<Exclude<XeroAccountRole, "vatStandard" | "zeroRated" | "exempt">, keyof FinancialCategoryMapping> = {
  salesAccount: "financial_sales_account_id",
  costOfSalesAccount: "financial_cost_of_sales_account_id",
  inventoryAssetAccount: "financial_inventory_asset_account_id",
  wipAccount: "financial_wip_account_id",
  packagingAccount: "financial_manufacturing_variance_account_id",
  manufacturingVarianceAccount: "financial_manufacturing_variance_account_id",
  stockAdjustmentAccount: "financial_stock_adjustment_account_id",
  freightIncomeAccount: "financial_freight_income_account_id",
  freightExpenseAccount: "financial_freight_expense_account_id",
};

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code || "");
  const message = String((error as { message?: string }).message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function normalizeIntegrationType(integrationType?: string | null): FinancialIntegrationType {
  const value = String(integrationType || "XERO").toUpperCase();
  return (value as FinancialIntegrationType) || "XERO";
}

function accountTypeMatches(role: XeroAccountRole, accountType: string | null | undefined) {
  const type = String(accountType || "").trim().toLowerCase();
  if (!type) return true;
  const hints = XERO_ACCOUNT_ROLE_TYPE_HINTS[role] || [];
  return hints.some((hint) => type.includes(hint));
}

function toCatalogEntry(row: AccountRow): FinancialAccountRecord {
  return {
    id: String(row.id || ""),
    workspace_id: String(row.workspace_id || ""),
    company_id: String(row.company_id || ""),
    integration_type: normalizeIntegrationType(row.integration_type as string | null),
    external_account_id: String(row.external_account_id || ""),
    account_code: String(row.account_code || ""),
    account_name: String(row.account_name || ""),
    account_type: String(row.account_type || ""),
    tax_type: (row.tax_type as string | null) || null,
    status: String(row.status || "ACTIVE"),
    enable_payments: Boolean(row.enable_payments),
    show_in_expense_claims: Boolean(row.show_in_expense_claims),
    updated_date: String(row.updated_date || new Date().toISOString()),
    last_synced: String(row.last_synced || new Date().toISOString()),
  };
}

function readNullableString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

async function fetchAccountCatalog(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  integrationType: FinancialIntegrationType
): Promise<FinancialAccountRecord[]> {
  const { data, error } = await supabase
    .from("vyron_financial_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("company_id", companyId)
    .eq("integration_type", integrationType)
    .order("account_code", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map((row) => toCatalogEntry(row as AccountRow));
}

export async function readFinancialAccountCatalog(
  workspaceId: string,
  companyId: string,
  integrationType: FinancialIntegrationType = "XERO"
): Promise<FinancialAccountCatalog> {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseServiceRoleConfigured() || !supabase) {
    return { syncedAt: null, syncedBy: null, integrationType, accounts: [] };
  }

  const accounts = await fetchAccountCatalog(supabase, workspaceId, companyId, integrationType);
  const syncedAt = accounts.length ? accounts[0]?.last_synced || null : null;
  return { syncedAt, syncedBy: null, integrationType, accounts };
}

export async function syncFinancialAccountCatalogFromXero(
  workspaceId: string,
  companyId: string,
  options: { actor?: string; integrationType?: FinancialIntegrationType } = {}
) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseServiceRoleConfigured() || !supabase) {
    throw new Error("Supabase service role is required for account sync.");
  }

  const integrationType = normalizeIntegrationType(options.integrationType || "XERO");
  const { accessToken, tenantId } = await getValidXeroAccessToken(workspaceId, {
    companyId,
    actor: options.actor || "system",
  });

  const response = await xeroApiRequest<{ Accounts?: Array<Record<string, unknown>> }>(workspaceId, "/Accounts", {
    companyId,
    actor: options.actor || "system",
  });

  const now = new Date().toISOString();
  const normalized = (response.Accounts || [])
    .map((row) => ({
      workspace_id: workspaceId,
      company_id: companyId,
      integration_type: integrationType,
      external_account_id: String(row.AccountID || row.accountID || row.AccountId || row.id || "").trim(),
      account_code: String(row.Code || row.code || "").trim(),
      account_name: String(row.Name || row.name || "").trim(),
      account_type: String(row.Type || row.type || "").trim(),
      tax_type: readNullableString(row, "TaxType"),
      status: String(row.Status || row.status || "ACTIVE").trim().toUpperCase(),
      enable_payments: Boolean(row.EnablePayments ?? row.enablePayments),
      show_in_expense_claims: Boolean(row.ShowInExpenseClaims ?? row.showInExpenseClaims),
      updated_date: now,
      last_synced: now,
    }))
    .filter((row) => row.external_account_id && row.status === "ACTIVE");

  const deduped = new Map<string, (typeof normalized)[number]>();
  for (const row of normalized) {
    deduped.set(row.external_account_id, row);
  }
  const activeAccounts = Array.from(deduped.values());

  if (activeAccounts.length) {
    const { error } = await supabase.from("vyron_financial_accounts").upsert(activeAccounts, {
      onConflict: "workspace_id,company_id,integration_type,external_account_id",
    });
    if (error) {
      if (!isMissingTableError(error)) throw new Error(error.message);
    }
  }

  const activeExternalIds = new Set(activeAccounts.map((account) => account.external_account_id));
  const { data: existingRows, error: existingRowsError } = await supabase
    .from("vyron_financial_accounts")
    .select("external_account_id")
    .eq("workspace_id", workspaceId)
    .eq("company_id", companyId)
    .eq("integration_type", integrationType)
    .neq("status", "INACTIVE");
  if (existingRowsError && !isMissingTableError(existingRowsError)) {
    throw new Error(existingRowsError.message);
  }

  const inactiveExternalIds = (existingRows || [])
    .map((row) => String((row as { external_account_id?: string }).external_account_id || ""))
    .filter((id) => id && !activeExternalIds.has(id));

  if (inactiveExternalIds.length > 0) {
    const { error: markInactiveError } = await supabase
      .from("vyron_financial_accounts")
      .update({ status: "INACTIVE", updated_date: now, last_synced: now })
      .eq("workspace_id", workspaceId)
      .eq("company_id", companyId)
      .eq("integration_type", integrationType)
      .in("external_account_id", inactiveExternalIds);
    if (markInactiveError && !isMissingTableError(markInactiveError)) {
      throw new Error(markInactiveError.message);
    }
  }

  return {
    integrationType,
    syncedAt: now,
    syncedBy: options.actor || "system",
    tenantId,
    accessToken: accessToken ? "***" : "",
    accountCount: activeAccounts.length,
  };
}

export async function readCompanyFinancialSettings(
  workspaceId: string,
  companyId: string,
  integrationType: FinancialIntegrationType = "XERO"
): Promise<FinancialCompanySettings> {
  const supabase = getSupabaseAdmin();
  const fallback: FinancialCompanySettings = {
    workspaceId,
    companyId,
    integrationType,
    defaultSalesAccountId: null,
    defaultCostOfSalesAccountId: null,
    defaultInventoryAssetAccountId: null,
    defaultWipAccountId: null,
    defaultManufacturingVarianceAccountId: null,
    defaultStockAdjustmentAccountId: null,
    defaultFreightIncomeAccountId: null,
    defaultFreightExpenseAccountId: null,
    defaultVatTaxType: null,
    trackingCategories: {},
    updatedAt: null,
    lastSynced: null,
  };

  if (!isSupabaseServiceRoleConfigured() || !supabase) return fallback;

  const { data, error } = await supabase
    .from("vyron_company_financial_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("company_id", companyId)
    .eq("integration_type", normalizeIntegrationType(integrationType))
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return fallback;
    throw new Error(error.message);
  }

  if (!data) return fallback;

  return {
    workspaceId: String(data.workspace_id || workspaceId),
    companyId: String(data.company_id || companyId),
    integrationType: normalizeIntegrationType(data.integration_type as string | null),
    defaultSalesAccountId: readNullableString(data as Record<string, unknown>, "default_sales_account_id"),
    defaultCostOfSalesAccountId: readNullableString(data as Record<string, unknown>, "default_cost_of_sales_account_id"),
    defaultInventoryAssetAccountId: readNullableString(data as Record<string, unknown>, "default_inventory_asset_account_id"),
    defaultWipAccountId: readNullableString(data as Record<string, unknown>, "default_wip_account_id"),
    defaultManufacturingVarianceAccountId: readNullableString(data as Record<string, unknown>, "default_manufacturing_variance_account_id"),
    defaultStockAdjustmentAccountId: readNullableString(data as Record<string, unknown>, "default_stock_adjustment_account_id"),
    defaultFreightIncomeAccountId: readNullableString(data as Record<string, unknown>, "default_freight_income_account_id"),
    defaultFreightExpenseAccountId: readNullableString(data as Record<string, unknown>, "default_freight_expense_account_id"),
    defaultVatTaxType: readNullableString(data as Record<string, unknown>, "default_vat_tax_type"),
    trackingCategories: (data.tracking_categories as Record<string, unknown>) || {},
    updatedAt: data.updated_at ? String(data.updated_at) : null,
    lastSynced: data.last_synced ? String(data.last_synced) : null,
  };
}

export async function saveCompanyFinancialSettings(
  workspaceId: string,
  companyId: string,
  settings: Partial<FinancialCompanySettings> & { integrationType?: FinancialIntegrationType } = {}
) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseServiceRoleConfigured() || !supabase) {
    throw new Error("Supabase service role is required for company financial settings.");
  }

  const payload = {
    workspace_id: workspaceId,
    company_id: companyId,
    integration_type: normalizeIntegrationType(settings.integrationType || "XERO"),
    default_sales_account_id: settings.defaultSalesAccountId || null,
    default_cost_of_sales_account_id: settings.defaultCostOfSalesAccountId || null,
    default_inventory_asset_account_id: settings.defaultInventoryAssetAccountId || null,
    default_wip_account_id: settings.defaultWipAccountId || null,
    default_manufacturing_variance_account_id: settings.defaultManufacturingVarianceAccountId || null,
    default_stock_adjustment_account_id: settings.defaultStockAdjustmentAccountId || null,
    default_freight_income_account_id: settings.defaultFreightIncomeAccountId || null,
    default_freight_expense_account_id: settings.defaultFreightExpenseAccountId || null,
    default_vat_tax_type: settings.defaultVatTaxType || null,
    tracking_categories: settings.trackingCategories || {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("vyron_company_financial_settings").upsert(payload, {
    onConflict: "workspace_id,company_id,integration_type",
  });
  if (error && !isMissingTableError(error)) throw new Error(error.message);
  return readCompanyFinancialSettings(workspaceId, companyId, normalizeIntegrationType(settings.integrationType || "XERO"));
}

export async function saveCategoryFinancialMapping(
  companyId: string,
  categoryName: string,
  mapping: FinancialCategoryMapping
) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseServiceRoleConfigured() || !supabase) {
    throw new Error("Supabase service role is required for category financial mappings.");
  }

  const payload = {
    financial_sales_account_id: mapping.financial_sales_account_id || null,
    financial_cost_of_sales_account_id: mapping.financial_cost_of_sales_account_id || null,
    financial_inventory_asset_account_id: mapping.financial_inventory_asset_account_id || null,
    financial_wip_account_id: mapping.financial_wip_account_id || null,
    financial_manufacturing_variance_account_id: mapping.financial_manufacturing_variance_account_id || null,
    financial_stock_adjustment_account_id: mapping.financial_stock_adjustment_account_id || null,
    financial_freight_income_account_id: mapping.financial_freight_income_account_id || null,
    financial_freight_expense_account_id: mapping.financial_freight_expense_account_id || null,
    financial_vat_tax_type: mapping.financial_vat_tax_type || null,
  };

  const { error } = await supabase
    .from("vyron_cost_categories")
    .update(payload)
    .eq("company_id", companyId)
    .eq("category_name", categoryName)
    .select("*")
    .maybeSingle();

  if (error && !isMissingTableError(error)) throw new Error(error.message);
  return payload;
}

export async function saveProductFinancialOverride(
  companyId: string,
  productId: string,
  mapping: FinancialProductOverride
) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseServiceRoleConfigured() || !supabase) {
    throw new Error("Supabase service role is required for product financial overrides.");
  }

  const payload = {
    financial_sales_account_id: mapping.financial_sales_account_id || null,
    financial_cost_of_sales_account_id: mapping.financial_cost_of_sales_account_id || null,
    financial_inventory_asset_account_id: mapping.financial_inventory_asset_account_id || null,
    financial_wip_account_id: mapping.financial_wip_account_id || null,
    financial_manufacturing_variance_account_id: mapping.financial_manufacturing_variance_account_id || null,
    financial_stock_adjustment_account_id: mapping.financial_stock_adjustment_account_id || null,
    financial_freight_income_account_id: mapping.financial_freight_income_account_id || null,
    financial_freight_expense_account_id: mapping.financial_freight_expense_account_id || null,
    financial_vat_tax_type: mapping.financial_vat_tax_type || null,
  };

  const { error } = await supabase
    .from("vyron_cost_products")
    .update(payload)
    .eq("company_id", companyId)
    .eq("id", productId)
    .select("*")
    .maybeSingle();

  if (error && !isMissingTableError(error)) throw new Error(error.message);
  return payload;
}

function pickAccountReference(
  value: string | null | undefined,
  catalog: FinancialAccountRecord[]
): FinancialAccountRecord | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return (
    catalog.find((account) => account.id === raw) ||
    catalog.find((account) => account.external_account_id === raw) ||
    catalog.find((account) => account.account_code === raw) ||
    null
  );
}

function roleColumn(role: Exclude<XeroAccountRole, "vatStandard" | "zeroRated" | "exempt">) {
  return ROLE_COLUMN_MAP[role];
}

export async function resolveFinancialAccountCode(
  context: FinancialAccountResolutionContext,
  role: Exclude<XeroAccountRole, "vatStandard" | "zeroRated" | "exempt">,
  overrides: {
    companySettings?: FinancialCompanySettings;
    categoryMapping?: FinancialCategoryMapping | null;
    productOverride?: FinancialProductOverride | null;
    catalog?: FinancialAccountRecord[];
  } = {}
) {
  const catalogList =
    overrides.catalog ||
    (await readFinancialAccountCatalog(context.workspaceId, context.companyId, context.integrationType)).accounts;
  const companySettings = overrides.companySettings || (await readCompanyFinancialSettings(context.workspaceId, context.companyId, context.integrationType));
  const companyDefaultRef = companySettings[roleColumn(role)] as string | null | undefined;
  const financialKey = ROLE_FINANCIAL_COLUMN_MAP[role];

  const selectedReference =
    pickAccountReference(overrides.productOverride?.[financialKey], catalogList) ||
    pickAccountReference(overrides.categoryMapping?.[financialKey], catalogList) ||
    pickAccountReference(companyDefaultRef, catalogList);

  return selectedReference?.account_code || null;
}

export async function resolveAccountCodeForProductLine(
  context: FinancialAccountResolutionContext,
  role: Exclude<XeroAccountRole, "vatStandard" | "zeroRated" | "exempt">,
  options: { productCategory?: string | null } = {}
) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseServiceRoleConfigured() || !supabase) return null;

  const [catalog, companySettings] = await Promise.all([
    readFinancialAccountCatalog(context.workspaceId, context.companyId, context.integrationType),
    readCompanyFinancialSettings(context.workspaceId, context.companyId, context.integrationType),
  ]);
  const financialKey = ROLE_FINANCIAL_COLUMN_MAP[role];

  const productId = String(context.productId || "").trim();
  const product = productId
    ? await supabase
        .from("vyron_cost_products")
        .select("financial_sales_account_id, financial_cost_of_sales_account_id, financial_inventory_asset_account_id, financial_wip_account_id, financial_manufacturing_variance_account_id, financial_stock_adjustment_account_id, financial_freight_income_account_id, financial_freight_expense_account_id, financial_vat_tax_type, product_category, category")
        .eq("company_id", context.companyId)
        .eq("id", productId)
        .maybeSingle()
        .then((res) => (res.error ? null : (res.data as (FinancialProductOverride & { product_category?: string | null; category?: string | null }) | null)))
    : null;

  const categoryName = String(options.productCategory || context.productCategory || product?.product_category || product?.category || context.categoryName || "").trim();
  const category = categoryName
    ? await supabase
        .from("vyron_cost_categories")
        .select("financial_sales_account_id, financial_cost_of_sales_account_id, financial_inventory_asset_account_id, financial_wip_account_id, financial_manufacturing_variance_account_id, financial_stock_adjustment_account_id, financial_freight_income_account_id, financial_freight_expense_account_id, financial_vat_tax_type")
        .eq("company_id", context.companyId)
        .ilike("category_name", categoryName)
        .maybeSingle()
        .then((res) => (res.error ? null : (res.data as FinancialCategoryMapping | null)))
    : null;

  const companyDefaultRef = companySettings[roleColumn(role)] as string | null | undefined;
  const selectedReference =
    pickAccountReference(product?.[financialKey], catalog.accounts) ||
    pickAccountReference(category?.[financialKey], catalog.accounts) ||
    pickAccountReference(companyDefaultRef, catalog.accounts);

  return selectedReference?.account_code || null;
}

export async function resolveVatTaxTypeForProductLine(
  context: FinancialAccountResolutionContext,
  options: { productCategory?: string | null } = {}
) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseServiceRoleConfigured() || !supabase) return null;

  const companySettings = await readCompanyFinancialSettings(context.workspaceId, context.companyId, context.integrationType);

  const productId = String(context.productId || "").trim();
  const product = productId
    ? await supabase
        .from("vyron_cost_products")
        .select("financial_vat_tax_type, product_category, category")
        .eq("company_id", context.companyId)
        .eq("id", productId)
        .maybeSingle()
        .then((res) => (res.error ? null : (res.data as { financial_vat_tax_type?: string | null; product_category?: string | null; category?: string | null } | null)))
    : null;

  const categoryName = String(options.productCategory || context.productCategory || product?.product_category || product?.category || context.categoryName || "").trim();
  const category = categoryName
    ? await supabase
        .from("vyron_cost_categories")
        .select("financial_vat_tax_type")
        .eq("company_id", context.companyId)
        .ilike("category_name", categoryName)
        .maybeSingle()
        .then((res) => (res.error ? null : (res.data as { financial_vat_tax_type?: string | null } | null)))
    : null;

  return (
    String(product?.financial_vat_tax_type || "").trim() ||
    String(category?.financial_vat_tax_type || "").trim() ||
    String(companySettings.defaultVatTaxType || "").trim() ||
    null
  );
}

export function buildFinancialCatalogOptions(catalog: FinancialAccountRecord[], role: XeroAccountRole) {
  return catalog.filter((account) => account.status.toUpperCase() === "ACTIVE" && accountTypeMatches(role, account.account_type));
}

export function toCatalogEntryList(accounts: FinancialAccountRecord[]): XeroAccountCatalogEntry[] {
  return accounts.map((account) => ({
    accountId: account.id,
    accountCode: account.account_code,
    accountName: account.account_name,
    accountType: account.account_type,
    accountClass: null,
    status: account.status,
    taxType: account.tax_type,
    systemAccount: null,
    isEnabled: account.status.toUpperCase() === "ACTIVE",
  }));
}
