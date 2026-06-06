import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export type XeroSyncStatus = "Ready" | "Synced" | "Failed" | "Needs Review";

export type XeroQueueEntityType =
  | "Customer"
  | "Supplier"
  | "Customer Invoice"
  | "Supplier Bill"
  | "Item"
  | "Purchase Order";

export type XeroConnectionState = {
  connected: boolean;
  organisationName: string;
  tenantId: string;
  connectedUser: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
};

export type XeroAccountMapping = {
  salesAccount: string;
  costOfSalesAccount: string;
  inventoryAssetAccount: string;
  packagingAccount: string;
  manufacturingVarianceAccount: string;
  stockAdjustmentAccount: string;
  vatStandard: string;
  zeroRated: string;
  exempt: string;
};

export const DEFAULT_XERO_ACCOUNT_MAPPING: XeroAccountMapping = {
  salesAccount: "200",
  costOfSalesAccount: "310",
  inventoryAssetAccount: "630",
  packagingAccount: "315",
  manufacturingVarianceAccount: "320",
  stockAdjustmentAccount: "625",
  vatStandard: "820",
  zeroRated: "821",
  exempt: "822",
};

export const XERO_CONNECTION_STORAGE_PREFIX = "vyron_xero_connection_";
export const XERO_MAPPING_STORAGE_PREFIX = "vyron_xero_account_mapping_";

export function xeroStorageKey(prefix: string, clientId = "default") {
  return `${prefix}${clientId}`;
}

export function defaultXeroConnection(): XeroConnectionState {
  return {
    connected: false,
    organisationName: "—",
    tenantId: "—",
    connectedUser: "—",
    connectedAt: null,
    lastSyncAt: null,
  };
}

export function demoXeroConnection(orgName = "Handcrafted Food Products (Pty) Ltd"): XeroConnectionState {
  const now = new Date().toISOString();
  return {
    connected: true,
    organisationName: orgName,
    tenantId: "demo-tenant-8f3a2c1b",
    connectedUser: "finance@handcraftedfood.co.za",
    connectedAt: now,
    lastSyncAt: now,
  };
}

export async function queueXeroSupplierBill(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    documentId: string;
    invoiceNumber: string | null;
    supplierName: string;
    total: number;
    invoiceDate?: string | null;
    status?: XeroSyncStatus;
    errorMessage?: string | null;
  }
) {
  const reference = input.invoiceNumber || `DOC-${input.documentId.slice(0, 8)}`;
  const { data: existing } = await supabase
    .from("vyron_xero_sync_queue")
    .select("id")
    .eq("reference_number", reference)
    .eq("entity_type", "Supplier Bill")
    .maybeSingle();
  if (existing) return existing;

  const needsReview = !input.supplierName?.trim();
  const status: XeroSyncStatus = input.status || (needsReview ? "Needs Review" : "Ready");

  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .insert({
      company_id: companyId,
      entity_type: "Supplier Bill",
      entity_id: input.documentId,
      reference_number: reference,
      destination: "Xero Bill",
      status,
      error_message: needsReview ? "Supplier name missing before sync." : input.errorMessage || null,
      payload: {
        supplierName: input.supplierName,
        invoiceNumber: reference,
        invoiceDate: input.invoiceDate,
        total: input.total,
      },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listXeroSyncQueueRows(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  let rows = data || [];
  if (rows.some((row) => row.company_id != null)) {
    rows = rows.filter((row) => !row.company_id || row.company_id === companyId);
  }
  return rows;
}

export function mapQueueRowToDisplay(row: Record<string, unknown>) {
  const payload = (row.payload || {}) as Record<string, unknown>;
  const entityType = String(row.entity_type || "Item") as XeroQueueEntityType;
  const counterparty =
    String(payload.customerName || payload.supplierName || payload.name || payload.productName || "—");

  return {
    id: String(row.id),
    type: entityType,
    reference: String(row.reference_number || "—"),
    counterparty,
    status: String(row.status || "Ready") as XeroSyncStatus,
    xeroId: row.xero_id ? String(row.xero_id) : undefined,
    lastAttempt: String(row.updated_at || row.created_at || ""),
    destination: String(row.destination || "Xero"),
    value: Number(payload.salesValue || payload.total || 0),
    note: row.error_message
      ? String(row.error_message)
      : row.status === "Ready"
        ? `Ready to sync to ${row.destination}.`
        : `Status: ${row.status}`,
  };
}

export function buildXeroOAuthUrl(appUrl: string) {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI || `${appUrl}/api/integrations/xero/callback`;
  if (!clientId) return null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email accounting.transactions accounting.contacts offline_access",
    state: "vyron-cost-xero",
  });
  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
}
