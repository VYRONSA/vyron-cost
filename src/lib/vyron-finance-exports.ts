import { getSupabaseAdmin } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export async function fetchFinanceExportRows(
  type:
    | "invoices"
    | "purchase-orders"
    | "grns"
    | "inventory-adjustments"
    | "production-journals"
    | "recovery-journals"
    | "cost-updates"
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const companyId = VYRON_DEFAULT_TENANT_ID;

  if (type === "invoices") {
    const { data } = await supabase
      .from("vyron_documents")
      .select("id, document_number, supplier_name, total, status, invoice_date, created_at")
      .eq("tenant_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    return (data || []).map((r) => ({
      document_id: r.id,
      document_number: r.document_number,
      supplier_name: r.supplier_name,
      total: r.total,
      status: r.status,
      invoice_date: r.invoice_date,
      created_at: r.created_at,
    }));
  }

  if (type === "purchase-orders") {
    const { data } = await supabase
      .from("vyron_cost_purchase_orders")
      .select("id, po_number, supplier_name_snapshot, status, subtotal, vat_amount, total, order_date, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);
    return (data || []).map((r) => ({
      po_id: r.id,
      po_number: r.po_number,
      supplier: r.supplier_name_snapshot,
      status: r.status,
      subtotal: r.subtotal,
      vat: r.vat_amount,
      total: r.total,
      order_date: r.order_date,
    }));
  }

  if (type === "grns") {
    const { data } = await supabase
      .from("vyron_cost_goods_receipts")
      .select("id, grn_number, supplier_name_snapshot, receipt_type, status, received_at, purchase_order_id")
      .eq("company_id", companyId)
      .order("received_at", { ascending: false })
      .limit(500);
    return (data || []).map((r) => ({
      grn_id: r.id,
      grn_number: r.grn_number,
      supplier: r.supplier_name_snapshot,
      receipt_type: r.receipt_type,
      status: r.status,
      received_at: r.received_at,
      purchase_order_id: r.purchase_order_id,
    }));
  }

  if (type === "inventory-adjustments") {
    const { data } = await supabase
      .from("vyron_cost_stock_ledger")
      .select("id, movement_type, quantity_in, quantity_out, value, movement_date, reference_type, reference_id")
      .eq("company_id", companyId)
      .in("movement_type", ["Adjustment", "Stock Count Variance", "Manual Correction"])
      .order("movement_date", { ascending: false })
      .limit(500);
    return data || [];
  }

  if (type === "production-journals") {
    const { data } = await supabase
      .from("vyron_cost_production_runs")
      .select("id, run_number, product_name_snapshot, status, actual_cost, completed_at")
      .eq("company_id", companyId)
      .eq("status", "Completed")
      .order("completed_at", { ascending: false })
      .limit(300);
    return (data || []).map((r) => ({
      run_id: r.id,
      run_number: r.run_number,
      product: r.product_name_snapshot,
      actual_cost: r.actual_cost,
      completed_at: r.completed_at,
    }));
  }

  if (type === "recovery-journals") {
    const { data } = await supabase
      .from("vyron_recovery_calculations")
      .select("opportunity_key, title, monthly_recovery, annual_recovery, tracking_status, recovered_to_date")
      .eq("tenant_id", companyId)
      .limit(300);
    return data || [];
  }

  if (type === "cost-updates") {
    const { data } = await supabase
      .from("vyron_supplier_price_history")
      .select("supplier_name, entity_name, previous_price, new_price, percentage_change, created_at")
      .eq("tenant_id", companyId)
      .order("created_at", { ascending: false })
      .limit(400);
    return data || [];
  }

  return [];
}
