/** Client-safe types and formatters for supplier intelligence UI. */

export type SupplierIntelRow = {
  id: string;
  supplier_name: string;
  category: string;
  current_spend: number;
  price_movement_percent: number;
  linked_ingredients: number;
  invoice_count: number;
  duplicate_invoice_risk: number;
  price_variance: number;
  reliability_score: number;
  negotiation_opportunity: number;
  supplier_risk_score: number;
  recommended_action: string;
  href: string;
};

export function formatSupplierSpend(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
