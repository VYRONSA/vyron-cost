import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchOption = {
  id: string;
  name: string;
  entityType: "ingredient" | "packaging" | "product";
  currentPrice: number;
};

export type ReviewLine = {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  vat: number | null;
  line_total: number | null;
  sku_product_code: string | null;
  confidence_score: number | null;
  matched_entity_type: string | null;
  matched_entity_id: string | null;
  matched_entity_name: string | null;
  ignored: boolean;
  mapping_confidence: number | null;
  suggested_match: {
    entityType: string;
    entityId: string | null;
    entityName: string | null;
    confidence: number;
    matchReason?: string;
    mappingId?: string | null;
  } | null;
};

export type ReviewDocument = {
  id: string;
  tenant_id: string;
  supplier_name: string | null;
  supplier_vat_number: string | null;
  customer_name: string | null;
  customer_vat_number: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  purchase_order_number: string | null;
  account_number: string | null;
  customer_reference: string | null;
  sales_representative: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  currency: string | null;
  status: string;
};

export type ReviewPayload = {
  document: ReviewDocument;
  lines: ReviewLine[];
  matchOptions: MatchOption[];
};

export function normalizeDescription(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function deriveInvoicePattern(invoiceNumber: string | null) {
  if (!invoiceNumber) return null;
  return invoiceNumber
    .replace(/[A-Za-z]+/g, "A")
    .replace(/[0-9]+/g, "9")
    .replace(/\s+/g, "")
    .slice(0, 40);
}

export function deriveDateFormat(date: string | null) {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return "YYYY-MM-DD";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return "DD/MM/YYYY";
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return "YYYY/MM/DD";
  return "unknown";
}

export async function getMatchOptions(supabase: SupabaseClient, tenantId: string): Promise<MatchOption[]> {
  const [ingredientsResult, productsResult] = await Promise.all([
    supabase
      .from("vyron_cost_ingredients")
      .select("id, ingredient_name, category, purchase_cost")
      .eq("company_id", tenantId)
      .order("ingredient_name", { ascending: true })
      .limit(2000),
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, total_cost")
      .eq("company_id", tenantId)
      .order("product_name", { ascending: true })
      .limit(2000),
  ]);

  const ingredientOptions =
    ingredientsResult.data?.map((row: any) => ({
      id: row.id as string,
      name: row.ingredient_name as string,
      entityType: /pack/i.test(String(row.category || "")) ? ("packaging" as const) : ("ingredient" as const),
      currentPrice: Number(row.purchase_cost || 0),
    })) ?? [];

  const productOptions =
    productsResult.data?.map((row: any) => ({
      id: row.id as string,
      name: row.product_name as string,
      entityType: "product" as const,
      currentPrice: Number(row.total_cost || 0),
    })) ?? [];

  return [...ingredientOptions, ...productOptions];
}

export { getSuggestedMapping, type SuggestedLineMatch, type SuggestedMatchReason } from "@/lib/vyron-supplier-line-learning";

