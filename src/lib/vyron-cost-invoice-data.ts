import { supabase } from "@/lib/supabase";
import { getIngredients, getSuppliers, CostIngredient, CostSupplier } from "@/lib/vyron-cost-core-data";
import { getPurchaseOrders, PurchaseOrder } from "@/lib/vyron-cost-purchase-order-data";

export type SupplierInvoice = {
  id: string;
  invoice_number: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  invoice_date?: string | null;
  status?: string | null;
  duplicate_risk?: boolean | null;
  subtotal?: number | null;
  vat?: number | null;
  total?: number | null;
};
export type SupplierInvoiceLine = {
  id: string;
  invoice_id?: string;
  ingredient_id?: string | null;
  item_name: string;
  category?: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  expected_unit_cost: number;
  variance_percent: number;
  vat_rate: number;
  line_excl?: number;
  line_vat?: number;
  line_total?: number;
};
export function formatMoney(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function calcLineExcl(qty: number, cost: number) { return Number(qty || 0) * Number(cost || 0); }
export function calcLineVat(qty: number, cost: number, vat: number) { return calcLineExcl(qty, cost) * Number(vat || 0) / 100; }
export function calcLineTotal(qty: number, cost: number, vat: number) { return calcLineExcl(qty, cost) + calcLineVat(qty, cost, vat); }
export function calcVariance(expected: number, actual: number) { if (!expected || expected <= 0) return 0; return ((actual - expected) / expected) * 100; }

/**
 * Supplier invoices for one company.
 *
 * This read the whole table, unscoped. It has no callers — the live path is
 * listSupplierInvoices in vyron-supplier-invoices.ts — but an unscoped read of
 * a tenant table is a trap for whoever calls it next, so the company is now
 * required rather than optional.
 */
export async function getSupplierInvoices(companyId: string): Promise<SupplierInvoice[]> {
  if (!supabase || !companyId) return demoInvoices;
  const { data, error } = await supabase.from("vyron_cost_supplier_invoices").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1000);
  if (error || !data) return demoInvoices;
  return data as SupplierInvoice[];
}
export async function getSupplierInvoiceById(companyId: string, id: string): Promise<{ invoice: SupplierInvoice | null; lines: SupplierInvoiceLine[] }> {
  if (!supabase || id.startsWith("demo")) return { invoice: demoInvoices[0], lines: demoInvoiceLines };
  if (!companyId) return { invoice: null, lines: [] };
  const invoice = await supabase.from("vyron_cost_supplier_invoices").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (invoice.error || !invoice.data) return { invoice: null, lines: [] };
  const lines = await supabase.from("vyron_cost_supplier_invoice_lines").select("*").eq("invoice_id", id);
  return { invoice: invoice.data as SupplierInvoice, lines: (lines.data || []) as SupplierInvoiceLine[] };
}
export async function getInvoiceFormData(): Promise<{ suppliers: CostSupplier[]; ingredients: CostIngredient[]; purchaseOrders: PurchaseOrder[] }> {
  const [suppliers, ingredients, purchaseOrders] = await Promise.all([getSuppliers(), getIngredients(), getPurchaseOrders()]);
  return { suppliers, ingredients, purchaseOrders };
}
export async function checkDuplicateInvoice(supplierId: string, invoiceNumber: string) {
  if (!supabase || !supplierId || !invoiceNumber.trim()) return false;
  // Supplier-scoped, and suppliers are company-scoped, so this cannot see
  // another tenant's invoice numbers.
  const { data } = await supabase.from("vyron_cost_supplier_invoices").select("id").eq("supplier_id", supplierId).ilike("invoice_number", invoiceNumber.trim()).limit(1);
  return Boolean(data && data.length > 0);
}
export const demoInvoices: SupplierInvoice[] = [{ id: "demo-inv-1", invoice_number: "INV-0001", supplier_name: "Cape Premium Meats", invoice_date: "2026-05-05", status: "Captured", duplicate_risk: false, subtotal: 11500, vat: 1725, total: 13225 }];
export const demoInvoiceLines: SupplierInvoiceLine[] = [{ id: "demo-inv-line-1", invoice_id: "demo-inv-1", item_name: "Beef Mince", category: "Protein", quantity: 100, unit: "kg", unit_cost: 115, expected_unit_cost: 100, variance_percent: 15, vat_rate: 15, line_excl: 11500, line_vat: 1725, line_total: 13225 }];
