import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_XERO_ACCOUNT_MAPPING,
  type XeroAccountMapping,
  type XeroQueueEntityType,
} from "@/lib/vyron-xero-integration";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export type XeroContactMapping = {
  localType: "customer" | "supplier";
  localId: string;
  xeroContactId: string;
  xeroContactName: string;
  lastSyncedAt: string;
  syncStatus: "synced" | "failed";
  lastError?: string | null;
};

export type XeroSyncConfig = {
  outboundCustomers: boolean;
  outboundSuppliers: boolean;
  outboundCustomerInvoices: boolean;
  outboundSupplierBills: boolean;
  outboundPurchaseOrders: boolean;
  outboundItems: boolean;
  inboundContacts: boolean;
  inboundAccounts: boolean;
  inboundTaxRates: boolean;
  inboundItems: boolean;
  invoiceStatus: "DRAFT" | "SUBMITTED";
};

export const DEFAULT_XERO_SYNC_CONFIG: XeroSyncConfig = {
  outboundCustomers: true,
  outboundSuppliers: true,
  outboundCustomerInvoices: true,
  outboundSupplierBills: false,
  outboundPurchaseOrders: false,
  outboundItems: false,
  inboundContacts: false,
  inboundAccounts: false,
  inboundTaxRates: false,
  inboundItems: false,
  invoiceStatus: "DRAFT",
};

export type XeroWorkspaceSettings = {
  accounts: XeroAccountMapping;
  contactMappings: Record<string, XeroContactMapping>;
  syncConfig: XeroSyncConfig;
};

const memoryStore = new Map<string, XeroWorkspaceSettings>();

function settingsKey(workspaceId: string) {
  return workspaceId;
}

function contactKey(localType: "customer" | "supplier", localId: string) {
  return `${localType}:${localId}`;
}

function normalizeStored(raw: unknown): XeroWorkspaceSettings {
  if (!raw || typeof raw !== "object") {
    return {
      accounts: DEFAULT_XERO_ACCOUNT_MAPPING,
      contactMappings: {},
      syncConfig: DEFAULT_XERO_SYNC_CONFIG,
    };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.accounts && typeof obj.accounts === "object") {
    return {
      accounts: { ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(obj.accounts as XeroAccountMapping) },
      contactMappings: (obj.contactMappings as Record<string, XeroContactMapping>) || {},
      syncConfig: { ...DEFAULT_XERO_SYNC_CONFIG, ...(obj.syncConfig as Partial<XeroSyncConfig>) },
    };
  }

  return {
    accounts: { ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(raw as XeroAccountMapping) },
    contactMappings: {},
    syncConfig: DEFAULT_XERO_SYNC_CONFIG,
  };
}

export async function readXeroWorkspaceSettings(workspaceId: string): Promise<XeroWorkspaceSettings> {
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("vyron_xero_workspace_settings")
        .select("account_mapping")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (data?.account_mapping) return normalizeStored(data.account_mapping);
    }
  }
  return memoryStore.get(settingsKey(workspaceId)) || normalizeStored(null);
}

export async function writeXeroWorkspaceSettings(workspaceId: string, settings: XeroWorkspaceSettings) {
  memoryStore.set(settingsKey(workspaceId), settings);
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("vyron_xero_workspace_settings").upsert({
        workspace_id: workspaceId,
        account_mapping: settings,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function saveAccountMapping(workspaceId: string, accounts: XeroAccountMapping) {
  const current = await readXeroWorkspaceSettings(workspaceId);
  const next = { ...current, accounts: { ...DEFAULT_XERO_ACCOUNT_MAPPING, ...accounts } };
  await writeXeroWorkspaceSettings(workspaceId, next);
  return next;
}

export async function saveSyncConfig(workspaceId: string, syncConfig: Partial<XeroSyncConfig>) {
  const current = await readXeroWorkspaceSettings(workspaceId);
  const next = { ...current, syncConfig: { ...current.syncConfig, ...syncConfig } };
  await writeXeroWorkspaceSettings(workspaceId, next);
  return next.syncConfig;
}

export async function upsertContactMapping(
  workspaceId: string,
  mapping: XeroContactMapping
) {
  const current = await readXeroWorkspaceSettings(workspaceId);
  const key = contactKey(mapping.localType, mapping.localId);
  const next = {
    ...current,
    contactMappings: {
      ...current.contactMappings,
      [key]: mapping,
    },
  };
  await writeXeroWorkspaceSettings(workspaceId, next);
  return mapping;
}

export function getContactMapping(
  settings: XeroWorkspaceSettings,
  localType: "customer" | "supplier",
  localId: string
) {
  return settings.contactMappings[contactKey(localType, localId)] || null;
}

export type MappingReadiness = {
  ready: boolean;
  missing: string[];
  accounts: XeroAccountMapping;
  syncConfig: XeroSyncConfig;
  contactMappingCount: number;
};

export function evaluateMappingReadiness(
  settings: XeroWorkspaceSettings,
  entityType: XeroQueueEntityType
): MappingReadiness {
  const missing: string[] = [];
  const { accounts } = settings;

  if (entityType === "Customer Invoice") {
    if (!accounts.salesAccount?.trim()) missing.push("Sales account code");
    if (!accounts.vatStandard?.trim()) missing.push("VAT tax type");
  }

  if (entityType === "Supplier Bill") {
    if (!accounts.costOfSalesAccount?.trim()) missing.push("Purchases / cost of sales account code");
    if (!accounts.vatStandard?.trim()) missing.push("VAT tax type");
  }

  if (entityType === "Customer" || entityType === "Customer Invoice") {
    // contact mapping created during sync if missing
  }

  if (entityType === "Supplier" || entityType === "Supplier Bill") {
    // contact mapping created during sync if missing
  }

  return {
    ready: missing.length === 0,
    missing,
    accounts: settings.accounts,
    syncConfig: settings.syncConfig,
    contactMappingCount: Object.keys(settings.contactMappings).length,
  };
}

export function mappingPanelStatus(settings: XeroWorkspaceSettings) {
  const checks = [
    { label: "Sales account", ok: Boolean(settings.accounts.salesAccount?.trim()), required: "Customer invoices" },
    { label: "Purchases / COGS account", ok: Boolean(settings.accounts.costOfSalesAccount?.trim()), required: "Supplier bills" },
    { label: "Inventory account", ok: Boolean(settings.accounts.inventoryAssetAccount?.trim()), required: "Inventory postings" },
    { label: "Cost of sales account", ok: Boolean(settings.accounts.costOfSalesAccount?.trim()), required: "COGS lines" },
    { label: "VAT / tax type", ok: Boolean(settings.accounts.vatStandard?.trim()), required: "Invoices & bills" },
    { label: "Customer contact mappings", ok: Object.values(settings.contactMappings).some((m) => m.localType === "customer"), required: "Optional until first sync" },
    { label: "Supplier contact mappings", ok: Object.values(settings.contactMappings).some((m) => m.localType === "supplier"), required: "Optional until first sync" },
  ];
  return checks;
}

export async function loadCustomerForSync(supabase: SupabaseClient, companyId: string, customerId: string) {
  const { data, error } = await supabase
    .from("vyron_customers")
    .select("*")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadSupplierForSync(supabase: SupabaseClient, companyId: string, supplierId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
