import { getIngredients, getSuppliers } from "@/lib/vyron-cost-core-data";
import { getInvoiceRiskFindings, getProcurementRiskFindings } from "@/lib/vyron-leakage-intelligence-data";
import { getPurchaseOrderList } from "@/lib/vyron-purchase-order-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type { SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-shared";
export { formatSupplierSpend } from "@/lib/vyron-supplier-intelligence-shared";
import type { SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-shared";

export async function getSupplierIntelligenceRows(): Promise<SupplierIntelRow[]> {
  const [suppliers, ingredients, invoices, procurement, pos] = await Promise.all([
    getSuppliers(),
    getIngredients(),
    getInvoiceRiskFindings(),
    getProcurementRiskFindings(),
    getPurchaseOrderList(),
  ]);

  if (!suppliers.length) {
    if ((await workspaceScope()).useDemo) {
      return [
        {
          id: "demo-s1",
          supplier_name: "Premium Meat Suppliers",
          category: "Protein",
          current_spend: 98400,
          price_movement_percent: 12.4,
          linked_ingredients: 8,
          invoice_count: 14,
          duplicate_invoice_risk: 1,
          price_variance: 1300,
          reliability_score: 72,
          negotiation_opportunity: 22720,
          supplier_risk_score: 86,
          recommended_action: "Negotiate protein lines and review alternate sourcing",
          href: "/suppliers",
        },
      ];
    }
    return [];
  }

  const scope = await workspaceScope();
  const widgets = await getSupplierPriceWidgetSummary(scope.companyId ?? scope.tenantId);
  const rowMap = suppliers.map((supplier) => {
    const linkedIngredients = ingredients.filter((i) => i.supplier_id === supplier.id);
    const spend = linkedIngredients.reduce((sum, i) => sum + Number(i.purchase_cost || 0), 0);
    const supplierInvoices = invoices.filter((inv) =>
      String(inv.supplier_name || "")
        .toLowerCase()
        .includes(supplier.supplier_name.toLowerCase().slice(0, 6))
    );
    const supplierPos = pos.filter((po) => {
      if ("supplier_id" in po && po.supplier_id) return po.supplier_id === supplier.id;
      return String(po.supplier_name_snapshot || "")
        .toLowerCase()
        .includes(supplier.supplier_name.toLowerCase().slice(0, 6));
    });
    const proc = procurement.find((p) =>
      String(p.supplier_name || "")
        .toLowerCase()
        .includes(supplier.supplier_name.toLowerCase().slice(0, 6))
    );
    const movement = Number(supplier.last_price_movement || 0);
    const duplicateRisk = supplierInvoices.filter((i) => /duplicate/i.test(String(i.risk_type || ""))).length;
    const variance = supplierPos.reduce((sum, po) => sum + Math.abs(Number(po.variance || 0)), 0);
    const riskScore = Math.min(
      99,
      Math.round(40 + movement * 2 + duplicateRisk * 8 + (proc ? Number(proc.risk_score || 0) * 0.2 : 0))
    );
    const reliability = Math.max(35, 100 - riskScore);
    const negotiation = Math.round(spend * (movement / 100) * 0.15);

    let action = "Monitor pricing and maintain approved supplier list";
    if (movement > 8 || duplicateRisk > 0) action = "Negotiate pricing and review invoice matching";
    if (riskScore > 80) action = "Urgent: escalate supplier review and lock PO approvals";

    return {
      id: supplier.id,
      supplier_name: supplier.supplier_name,
      category: supplier.category || "General",
      current_spend: Math.round(spend),
      price_movement_percent: movement,
      linked_ingredients: linkedIngredients.length,
      invoice_count: supplierInvoices.length || supplierPos.length,
      duplicate_invoice_risk: duplicateRisk,
      price_variance: Math.round(variance),
      reliability_score: reliability,
      negotiation_opportunity: negotiation,
      supplier_risk_score: riskScore,
      recommended_action: action,
      href: `/supplier-intelligence/${supplier.id}`,
    };
  });

  if (!widgets.suppliersWithMostChanges.length) return rowMap;

  const movementByName = new Map(
    widgets.suppliersWithMostChanges.map((item) => [item.supplierName.toLowerCase(), item.changes])
  );

  return rowMap.map((row) => {
    const liveChanges = movementByName.get(row.supplier_name.toLowerCase()) || 0;
    if (!liveChanges) return row;
    const riskBoost = Math.min(18, liveChanges * 2);
    return {
      ...row,
      invoice_count: Math.max(row.invoice_count, liveChanges),
      supplier_risk_score: Math.min(99, row.supplier_risk_score + riskBoost),
      recommended_action:
        liveChanges >= 4
          ? "High movement volume detected. Open drilldown and confirm contract pricing."
          : row.recommended_action,
    };
  });
}

