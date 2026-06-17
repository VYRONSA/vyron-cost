import type { SupabaseClient } from "@supabase/supabase-js";
import { readConnection } from "@/lib/vyron-xero-connection-store";

export type WorkspaceDashboardStats = {
  suppliers: number;
  ingredients: number;
  products: number;
  inventoryValue: number;
  customerInvoices: number;
  xeroStatus: string;
};

export async function getWorkspaceDashboardStats(
  supabase: SupabaseClient,
  companyId: string,
  workspaceId?: string | null
): Promise<WorkspaceDashboardStats> {
  const [
    { count: suppliers },
    { count: ingredients },
    { count: products },
    { count: customerInvoices },
    { data: stockItems },
    { data: workspaceRow },
  ] = await Promise.all([
    supabase.from("vyron_cost_suppliers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_cost_ingredients").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_cost_products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_customer_invoices").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_cost_stock_items").select("qty_on_hand, current_cost").eq("company_id", companyId),
    workspaceId
      ? Promise.resolve({ data: { id: workspaceId } })
      : supabase.from("vyron_workspaces").select("id").eq("company_id", companyId).maybeSingle(),
  ]);

  const inventoryValue = (stockItems || []).reduce(
    (sum, row) => sum + Number(row.qty_on_hand || 0) * Number(row.current_cost || 0),
    0
  );

  let xeroStatus = "Not Connected";
  const resolvedWorkspaceId = workspaceId || (workspaceRow as { id?: string } | null)?.id;
  if (resolvedWorkspaceId) {
    try {
      const connection = await readConnection(resolvedWorkspaceId);
      if (connection.connected) {
        xeroStatus = connection.organisationName
          ? `Connected · ${connection.organisationName}`
          : "Connected";
      }
    } catch {
      xeroStatus = "Not Connected";
    }
  }

  return {
    suppliers: suppliers || 0,
    ingredients: ingredients || 0,
    products: products || 0,
    inventoryValue: Math.round(inventoryValue * 100) / 100,
    customerInvoices: customerInvoices || 0,
    xeroStatus,
  };
}
