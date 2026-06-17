import type { BusinessHealthInput } from "@/lib/vyron-business-health";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";

export type WarningSeverity = "Critical" | "High" | "Medium" | "Low";

export type WarningCategory =
  | "Margin"
  | "Supplier"
  | "Inventory"
  | "Procurement"
  | "Manufacturing"
  | "Customer"
  | "Xero"
  | "Data Quality";

export type WarningConfidence = "High" | "Medium" | "Low";

export type EarlyWarningItem = {
  id: string;
  severity: WarningSeverity;
  category: WarningCategory;
  title: string;
  description: string;
  impact: string;
  confidence: WarningConfidence;
  sourceData: string;
  recommendedAction: string;
  href: string;
  exposureValue: number | null;
};

export type WarningCategoryCard = {
  id: string;
  label: string;
  count: number;
  highestSeverity: WarningSeverity | "None";
  mainIssue: string;
  href: string;
};

export type PriorityAction = {
  id: string;
  priority: number;
  severity: WarningSeverity;
  title: string;
  explanation: string;
  outcome: string;
  href: string;
};

export type TopRiskItem = {
  id: string;
  risk: string;
  severity: WarningSeverity;
  businessImpact: string;
  confidence: WarningConfidence;
  recommendedResponse: string;
  href: string;
};

export type RecipeQualityStats = {
  totalRecipes: number;
  recipesWithoutLines: number;
  recipesWithoutCosting: number;
};

export type EarlyWarningSnapshot = {
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    potentialExposure: number | null;
    exposureLabel: string;
  };
  warnings: EarlyWarningItem[];
  categoryCards: WarningCategoryCard[];
  priorityActions: PriorityAction[];
  dataQualityWarnings: EarlyWarningItem[];
  topRisks: TopRiskItem[];
  hasMonitoringData: boolean;
};

export type EarlyWarningInput = BusinessHealthInput & {
  invoiceSyncReady: boolean;
  xeroQueueFailed: number;
  xeroQueueReady: number;
  recipeQuality: RecipeQualityStats | null;
};

const CATEGORY_HREFS: Record<WarningCategory, string> = {
  Margin: "/cost-intelligence",
  Supplier: "/suppliers",
  Inventory: "/inventory/stock",
  Procurement: "/purchase-orders",
  Manufacturing: "/manufacturing",
  Customer: "/customer-invoices",
  Xero: "/integrations/xero",
  "Data Quality": "/products",
};

const CATEGORY_LABELS: Record<WarningCategory, string> = {
  Margin: "Margin Warnings",
  Supplier: "Supplier Warnings",
  Inventory: "Inventory Warnings",
  Procurement: "Procurement Warnings",
  Manufacturing: "Manufacturing Warnings",
  Customer: "Customer Warnings",
  Xero: "Xero Warnings",
  "Data Quality": "Data Quality Warnings",
};

const SEVERITY_WEIGHT: Record<WarningSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function highestSeverity(items: EarlyWarningItem[]): WarningSeverity | "None" {
  if (!items.length) return "None";
  return items.reduce(
    (best, item) => (SEVERITY_WEIGHT[item.severity] > SEVERITY_WEIGHT[best] ? item.severity : best),
    items[0].severity
  );
}

function computePotentialExposure(input: EarlyWarningInput, warnings: EarlyWarningItem[]): number | null {
  let total = 0;

  if (input.intelligence) {
    const marginExposure = (input.intelligence.products || [])
      .filter((row) => Number(row.gp_gap ?? 0) < 0)
      .reduce((sum, row) => sum + Number(row.monthly_risk_value || 0), 0);
    const recovery = Number(input.intelligence.summary.recoveryMonthly || 0);
    const supplierExposure = (input.intelligence.supplierInflation || []).reduce(
      (sum, row) => sum + Number(row.monthlyExposure || 0),
      0
    );
    total += marginExposure + recovery + supplierExposure;
  }

  const warningExposure = warnings.reduce((sum, row) => sum + Number(row.exposureValue || 0), 0);
  if (warningExposure > total) total = warningExposure;

  return total > 0 ? Math.round(total) : null;
}

function buildMarginWarnings(intelligence: TenantCostIntelligence | null): EarlyWarningItem[] {
  if (!intelligence?.products.length) return [];
  const warnings: EarlyWarningItem[] = [];
  const products = intelligence.products;
  const belowGp = products.filter((row) => Number(row.gp_gap ?? 0) < 0);
  const criticalBelow = belowGp.filter((row) => row.risk_level === "Critical" || Number(row.gp_gap) < -5);
  const missingPrice = products.filter((row) => !Number(row.selling_price));
  const missingCost = products.filter((row) => !Number(row.total_cost));
  const repricing = intelligence.repricingSuggestions || [];

  if (criticalBelow.length > 0) {
    const exposure = criticalBelow.reduce((sum, row) => sum + Number(row.monthly_risk_value || 0), 0);
    warnings.push({
      id: "margin-critical-below-gp",
      severity: "Critical",
      category: "Margin",
      title: "Critical margin erosion",
      description: `${criticalBelow.length} product(s) materially below target GP.`,
      impact: exposure > 0 ? `Estimated ${money(exposure)}/month margin risk.` : "Margin recovery required on key products.",
      confidence: "High",
      sourceData: "Product margin intelligence",
      recommendedAction: "Reprice products below GP target or recover supplier cost.",
      href: "/reports/product-margins",
      exposureValue: exposure > 0 ? exposure : null,
    });
  } else if (belowGp.length > 0) {
    const exposure = belowGp.reduce((sum, row) => sum + Number(row.monthly_risk_value || 0), 0);
    warnings.push({
      id: "margin-below-gp",
      severity: belowGp.length >= 5 ? "High" : "Medium",
      category: "Margin",
      title: "Products below target GP",
      description: `${belowGp.length} product(s) are below target gross profit.`,
      impact: exposure > 0 ? `Estimated ${money(exposure)}/month at risk.` : "Selling price or cost discipline needed.",
      confidence: "High",
      sourceData: "Product margin intelligence",
      recommendedAction: "Review low-margin products in Cost Intelligence.",
      href: "/cost-intelligence",
      exposureValue: exposure > 0 ? exposure : null,
    });
  }

  if (missingPrice.length > 0) {
    warnings.push({
      id: "margin-missing-price",
      severity: missingPrice.length >= 5 ? "High" : "Medium",
      category: "Margin",
      title: "Missing selling prices",
      description: `${missingPrice.length} product(s) have no selling price on record.`,
      impact: "Margin analysis and invoice profitability cannot be validated.",
      confidence: "High",
      sourceData: "Product master · selling_price",
      recommendedAction: "Complete missing selling prices on the product master.",
      href: "/products",
      exposureValue: null,
    });
  }

  if (missingCost.length > 0) {
    warnings.push({
      id: "margin-missing-cost",
      severity: missingCost.length >= 5 ? "High" : "Medium",
      category: "Margin",
      title: "Missing product cost",
      description: `${missingCost.length} product(s) have no total cost on record.`,
      impact: "True margin and repricing signals are incomplete.",
      confidence: "High",
      sourceData: "Product master · total_cost / BOM",
      recommendedAction: "Complete BOM cost structures for affected products.",
      href: "/recipes",
      exposureValue: null,
    });
  }

  if (repricing.length >= 3 && belowGp.length === 0) {
    warnings.push({
      id: "margin-repricing-review",
      severity: "Low",
      category: "Margin",
      title: "Suggested repricing on products",
      description: `${repricing.length} product(s) have suggested repricing from cost intelligence.`,
      impact: "Proactive margin protection opportunity.",
      confidence: "Medium",
      sourceData: "Cost intelligence · repricing suggestions",
      recommendedAction: "Review suggested prices before supplier costs move further.",
      href: "/reports/product-margins",
      exposureValue: repricing.reduce((sum, row) => sum + Number(row.monthlyRecovery || 0), 0) || null,
    });
  }

  return warnings;
}

function buildSupplierWarnings(intelligence: TenantCostIntelligence | null): EarlyWarningItem[] {
  if (!intelligence) return [];
  const warnings: EarlyWarningItem[] = [];
  const inflation = intelligence.supplierInflation || [];
  const critical = inflation.filter((row) => row.riskLevel === "Critical");

  if (critical.length > 0) {
    const exposure = critical.reduce((sum, row) => sum + Number(row.monthlyExposure || 0), 0);
    warnings.push({
      id: "supplier-critical-inflation",
      severity: "Critical",
      category: "Supplier",
      title: "Critical supplier inflation",
      description: `${critical.length} supplier(s) with high recorded price movement.`,
      impact: exposure > 0 ? `Estimated ${money(exposure)}/month procurement exposure.` : "Supplier cost pressure on finished product margin.",
      confidence: "High",
      sourceData: "Supplier inflation intelligence",
      recommendedAction: "Review supplier inflation and renegotiate affected categories.",
      href: "/document-intelligence/price-history/supplier",
      exposureValue: exposure > 0 ? exposure : null,
    });
  } else if (inflation.length > 0) {
    const exposure = inflation.reduce((sum, row) => sum + Number(row.monthlyExposure || 0), 0);
    warnings.push({
      id: "supplier-inflation",
      severity: inflation.length >= 5 ? "High" : "Medium",
      category: "Supplier",
      title: "Supplier price movement",
      description: `${inflation.length} supplier(s) show recorded price movement.`,
      impact: exposure > 0 ? `Estimated ${money(exposure)}/month impact.` : "Monitor procurement and BOM cost build-up.",
      confidence: "High",
      sourceData: "Supplier master · price movement",
      recommendedAction: "Review supplier price history and PO pricing.",
      href: "/suppliers",
      exposureValue: exposure > 0 ? exposure : null,
    });
  }

  return warnings;
}

function buildInventoryWarnings(input: EarlyWarningInput): EarlyWarningItem[] {
  const inv = input.commandData?.inventory;
  if (!inv) return [];
  const warnings: EarlyWarningItem[] = [];

  if (inv.negativeStockRisks > 0) {
    warnings.push({
      id: "inventory-negative-stock",
      severity: "Critical",
      category: "Inventory",
      title: "Negative stock risk",
      description: `${inv.negativeStockRisks} stock item(s) show negative on-hand quantity.`,
      impact: "Stock integrity and invoice posting accuracy at risk.",
      confidence: "High",
      sourceData: "Inventory intelligence · stock on hand",
      recommendedAction: "Resolve negative stock and review recent movements.",
      href: "/inventory/stock",
      exposureValue: null,
    });
  }

  if (inv.lowStock > 0) {
    warnings.push({
      id: "inventory-low-stock",
      severity: inv.lowStock >= 5 ? "High" : "Medium",
      category: "Inventory",
      title: "Low stock alerts",
      description: `${inv.lowStock} SKU(s) below reorder levels.`,
      impact: "Potential stock-outs affecting production and customer fulfilment.",
      confidence: "High",
      sourceData: "Inventory intelligence · reorder levels",
      recommendedAction: "Review low-stock alerts and raise purchase orders.",
      href: "/inventory/alerts",
      exposureValue: null,
    });
  }

  if (inv.slowMoving > 0) {
    warnings.push({
      id: "inventory-slow-moving",
      severity: inv.slowMoving >= 5 ? "High" : "Medium",
      category: "Inventory",
      title: "Slow-moving stock exposure",
      description: `${inv.slowMoving} SKU(s) flagged as slow-moving (no recent movement).`,
      impact:
        inv.inventoryValue > 0
          ? `Inventory book value ${money(inv.inventoryValue)} — working capital at risk in slow stock.`
          : "Working capital tied up in slow stock.",
      confidence: "High",
      sourceData: "Inventory intelligence · last movement",
      recommendedAction: "Review slow-moving items and consider write-down or promotion.",
      href: "/inventory/stock",
      exposureValue: inv.inventoryValue > 0 ? inv.inventoryValue : null,
    });
  }

  if (inv.overstock > 0) {
    warnings.push({
      id: "inventory-overstock",
      severity: "Medium",
      category: "Inventory",
      title: "Overstock exposure",
      description: `${inv.overstock} SKU(s) above maximum stock levels.`,
      impact: "Excess inventory increases holding cost and obsolescence risk.",
      confidence: "High",
      sourceData: "Inventory intelligence · max levels",
      recommendedAction: "Review overstock positions and adjust purchasing.",
      href: "/inventory/stock",
      exposureValue: null,
    });
  }

  return warnings;
}

function buildProcurementWarnings(input: EarlyWarningInput): EarlyWarningItem[] {
  const proc = input.commandData?.procurement;
  if (!proc) return [];
  const warnings: EarlyWarningItem[] = [];

  if (proc.poVariances > 0) {
    warnings.push({
      id: "procurement-po-variance",
      severity: proc.poVariances >= 5 ? "High" : "Medium",
      category: "Procurement",
      title: "Purchase order variances",
      description: `${proc.poVariances} PO variance(s) detected on recorded procurement data.`,
      impact: "Cost leakage between ordered and received pricing.",
      confidence: "High",
      sourceData: "Procurement intelligence · PO variances",
      recommendedAction: "Review PO vs GRN pricing mismatches.",
      href: "/purchase-orders",
      exposureValue: null,
    });
  }

  if (proc.openPos >= 15) {
    warnings.push({
      id: "procurement-open-pos",
      severity: proc.openPos >= 30 ? "High" : "Medium",
      category: "Procurement",
      title: "High open purchase order count",
      description: `${proc.openPos} open purchase order(s) on record.`,
      impact: "Fulfilment delays or uncommitted spend may affect cost planning.",
      confidence: "Medium",
      sourceData: "Procurement intelligence · open PO count",
      recommendedAction: "Clear aged open POs and confirm supplier delivery.",
      href: "/purchase-orders",
      exposureValue: proc.spendThisMonth > 0 ? proc.spendThisMonth : null,
    });
  }

  return warnings;
}

function buildManufacturingWarnings(input: EarlyWarningInput): EarlyWarningItem[] {
  const mfg = input.commandData?.manufacturing;
  const bomMovement = input.intelligence?.bomCostMovement.length ?? 0;
  const warnings: EarlyWarningItem[] = [];

  if (mfg && mfg.wastagePct >= 5) {
    warnings.push({
      id: "manufacturing-wastage",
      severity: mfg.wastagePct >= 10 ? "Critical" : "High",
      category: "Manufacturing",
      title: "Manufacturing wastage elevated",
      description: `Wastage at ${mfg.wastagePct.toFixed(1)}% · Yield ${mfg.yieldPct.toFixed(1)}%.`,
      impact: "Batch cost and finished goods margin under pressure.",
      confidence: "High",
      sourceData: "Manufacturing intelligence · wastage / yield",
      recommendedAction: "Investigate batch variances and recipe adherence.",
      href: "/manufacturing/variances",
      exposureValue: mfg.productionCost > 0 ? mfg.productionCost : null,
    });
  }

  if (bomMovement > 0) {
    warnings.push({
      id: "manufacturing-bom-movement",
      severity: bomMovement >= 6 ? "High" : "Medium",
      category: "Manufacturing",
      title: "BOM ingredient cost movement",
      description: `${bomMovement} ingredient(s) with recorded cost movement affecting recipes.`,
      impact: "Finished product cost and margin may shift without repricing.",
      confidence: "High",
      sourceData: "BOM cost movement intelligence",
      recommendedAction: "Recalculate BOM costs and review finished product pricing.",
      href: "/recipes",
      exposureValue: null,
    });
  }

  if (mfg && mfg.yieldPct > 0 && mfg.yieldPct < 85 && mfg.wastagePct < 5) {
    warnings.push({
      id: "manufacturing-low-yield",
      severity: "Medium",
      category: "Manufacturing",
      title: "Production yield below target",
      description: `Yield at ${mfg.yieldPct.toFixed(1)}% on recent manufacturing activity.`,
      impact: "Higher input cost per finished unit.",
      confidence: "Medium",
      sourceData: "Manufacturing intelligence · yield",
      recommendedAction: "Review production runs and recipe yields.",
      href: "/manufacturing",
      exposureValue: null,
    });
  }

  return warnings;
}

function buildCustomerWarnings(input: EarlyWarningInput): EarlyWarningItem[] {
  const { invoiceSummary } = input;
  if (!invoiceSummary || invoiceSummary.invoiceCount === 0) {
    return [];
  }

  const warnings: EarlyWarningItem[] = [];

  if (invoiceSummary.monthlyGpPct > 0 && invoiceSummary.monthlyGpPct < 30) {
    warnings.push({
      id: "customer-low-gp",
      severity: invoiceSummary.monthlyGpPct < 25 ? "Critical" : "High",
      category: "Customer",
      title: "Low realised invoice GP",
      description: `Month GP ${invoiceSummary.monthlyGpPct.toFixed(1)}% across ${invoiceSummary.invoiceCount} posted invoice(s).`,
      impact:
        invoiceSummary.monthlySales > 0
          ? `${money(invoiceSummary.monthlySales)} sales with weak margin.`
          : "Customer profitability under pressure.",
      confidence: "High",
      sourceData: "Customer invoice intelligence · month to date",
      recommendedAction: "Review customer pricing and product mix on invoices.",
      href: "/customer-invoices",
      exposureValue: invoiceSummary.monthlySales > 0 ? invoiceSummary.monthlySales : null,
    });
  }

  if (invoiceSummary.invoiceCount >= 3 && invoiceSummary.uniqueCustomers === 1) {
    warnings.push({
      id: "customer-concentration",
      severity: "Medium",
      category: "Customer",
      title: "Customer concentration",
      description: "All posted month invoices relate to a single customer.",
      impact: "Revenue concentration increases business risk.",
      confidence: "Medium",
      sourceData: "Customer invoice intelligence · unique customers",
      recommendedAction: "Diversify customer base and monitor key account margin.",
      href: "/customers",
      exposureValue: invoiceSummary.monthlySales > 0 ? invoiceSummary.monthlySales : null,
    });
  }

  return warnings;
}

function buildXeroWarnings(input: EarlyWarningInput): EarlyWarningItem[] {
  const { xeroConnection, invoiceSyncReady, xeroQueueFailed, xeroQueueReady } = input;
  if (!xeroConnection) return [];
  const warnings: EarlyWarningItem[] = [];

  if (xeroConnection.pendingOrganisationSelection) {
    warnings.push({
      id: "xero-org-not-selected",
      severity: "High",
      category: "Xero",
      title: "Xero organisation not selected",
      description: "OAuth completed but no Xero organisation is selected for this workspace.",
      impact: "Accounting sync is blocked until an organisation is chosen.",
      confidence: "High",
      sourceData: "Xero connection health",
      recommendedAction: "Select the Xero organisation on the integration page.",
      href: "/integrations/xero",
      exposureValue: null,
    });
  }

  if (!xeroConnection.connected) {
    warnings.push({
      id: "xero-disconnected",
      severity: "High",
      category: "Xero",
      title: "Xero disconnected",
      description: `Integration status: ${xeroConnection.status || "Not Connected"}.`,
      impact: "Customers, suppliers and invoices cannot sync to accounting.",
      confidence: "High",
      sourceData: "Xero connection health",
      recommendedAction: "Connect or reconnect Xero for this workspace.",
      href: "/integrations/xero",
      exposureValue: null,
    });
  } else if (xeroConnection.status === "Token Expired") {
    warnings.push({
      id: "xero-token-expired",
      severity: "Critical",
      category: "Xero",
      title: "Xero token expired",
      description: "The Xero access token has expired for this workspace.",
      impact: "Sync and posting to Xero will fail until token is refreshed.",
      confidence: "High",
      sourceData: "Xero connection health",
      recommendedAction: "Refresh token or reconnect Xero.",
      href: "/integrations/xero",
      exposureValue: null,
    });
  }

  if (!invoiceSyncReady && xeroConnection.connected) {
    warnings.push({
      id: "xero-mapping-incomplete",
      severity: "High",
      category: "Xero",
      title: "Invoice mapping incomplete",
      description: "Sales account and/or VAT tax type mapping is missing.",
      impact: "Customer invoice sync to Xero is blocked.",
      confidence: "High",
      sourceData: "Xero mapping configuration",
      recommendedAction: "Resolve Xero mapping issues before syncing invoices.",
      href: "/integrations/xero",
      exposureValue: null,
    });
  }

  if (xeroQueueFailed > 0) {
    warnings.push({
      id: "xero-sync-failures",
      severity: xeroQueueFailed >= 5 ? "Critical" : "High",
      category: "Xero",
      title: "Xero sync queue failures",
      description: `${xeroQueueFailed} item(s) failed in the Xero sync queue.`,
      impact: "Accounting records may be out of date with operational data.",
      confidence: "High",
      sourceData: "Xero sync queue",
      recommendedAction: "Review failed queue items and retry sync.",
      href: "/integrations/xero",
      exposureValue: null,
    });
  }

  if (xeroQueueReady >= 10 && xeroConnection.connected) {
    warnings.push({
      id: "xero-sync-backlog",
      severity: "Medium",
      category: "Xero",
      title: "Xero sync backlog",
      description: `${xeroQueueReady} item(s) waiting in the Xero sync queue.`,
      impact: "Delayed posting to Xero may affect month-end close.",
      confidence: "High",
      sourceData: "Xero sync queue",
      recommendedAction: "Run sync now for customers, suppliers or invoices.",
      href: "/integrations/xero",
      exposureValue: null,
    });
  }

  return warnings;
}

function buildDataQualityWarnings(input: EarlyWarningInput): EarlyWarningItem[] {
  const products = input.intelligence?.products ?? [];
  const warnings: EarlyWarningItem[] = [];
  const missingCost = products.filter((row) => !Number(row.total_cost));
  const missingPrice = products.filter((row) => !Number(row.selling_price));

  if (products.length === 0) {
    warnings.push({
      id: "dq-no-products",
      severity: "Medium",
      category: "Data Quality",
      title: "No products on record",
      description: "Product master is empty for this company.",
      impact: "Margin, cost and inventory warnings cannot be generated.",
      confidence: "High",
      sourceData: "Product master",
      recommendedAction: "Create products with costs, prices and target GP.",
      href: "/products",
      exposureValue: null,
    });
  } else {
    if (missingCost.length > 0) {
      warnings.push({
        id: "dq-missing-cost",
        severity: missingCost.length >= 5 ? "High" : "Medium",
        category: "Data Quality",
        title: "Products without cost",
        description: `${missingCost.length} product(s) missing total cost.`,
        impact: "Cost intelligence and margin warnings are incomplete.",
        confidence: "High",
        sourceData: "Product master · total_cost",
        recommendedAction: "Complete BOM/recipe costs for affected products.",
        href: "/recipes",
        exposureValue: null,
      });
    }

    if (missingPrice.length > 0) {
      warnings.push({
        id: "dq-missing-price",
        severity: missingPrice.length >= 5 ? "High" : "Medium",
        category: "Data Quality",
        title: "Products without selling price",
        description: `${missingPrice.length} product(s) missing selling price.`,
        impact: "Repricing and margin recovery cannot be calculated.",
        confidence: "High",
        sourceData: "Product master · selling_price",
        recommendedAction: "Complete missing selling prices.",
        href: "/products",
        exposureValue: null,
      });
    }
  }

  const recipeQuality = input.recipeQuality;
  if (recipeQuality && recipeQuality.totalRecipes > 0) {
    if (recipeQuality.recipesWithoutLines > 0) {
      warnings.push({
        id: "dq-bom-missing-ingredients",
        severity: recipeQuality.recipesWithoutLines >= 3 ? "High" : "Medium",
        category: "Data Quality",
        title: "BOMs missing ingredients",
        description: `${recipeQuality.recipesWithoutLines} recipe/BOM(s) have no ingredient lines.`,
        impact: "Product costing and margin warnings may be inaccurate.",
        confidence: "High",
        sourceData: "Recipe / BOM master · line count",
        recommendedAction: "Add ingredient lines to incomplete BOMs.",
        href: "/recipes",
        exposureValue: null,
      });
    }

    if (recipeQuality.recipesWithoutCosting > 0) {
      warnings.push({
        id: "dq-bom-missing-costing",
        severity: recipeQuality.recipesWithoutCosting >= 3 ? "High" : "Medium",
        category: "Data Quality",
        title: "BOMs missing costing",
        description: `${recipeQuality.recipesWithoutCosting} recipe/BOM(s) have zero or missing total cost.`,
        impact: "Finished product margin cannot be validated.",
        confidence: "High",
        sourceData: "Recipe / BOM master · total_cost",
        recommendedAction: "Complete BOM cost structures with ingredient costs.",
        href: "/recipes",
        exposureValue: null,
      });
    }
  }

  const inflationCount = input.intelligence?.summary.inflationSuppliers ?? 0;
  const hasProcurement = Boolean(input.commandData?.procurement.spendThisMonth);
  if (hasProcurement && inflationCount === 0 && products.length > 0) {
    warnings.push({
      id: "dq-supplier-pricing-history",
      severity: "Low",
      category: "Data Quality",
      title: "Suppliers without pricing history",
      description: "Procurement activity exists but no supplier price movement is on record.",
      impact: "Supplier inflation warnings may be under-detected.",
      confidence: "Medium",
      sourceData: "Supplier master · last_price_movement",
      recommendedAction: "Update supplier costs from GRNs and price history.",
      href: "/suppliers",
      exposureValue: null,
    });
  }

  if (!input.invoiceSummary || input.invoiceSummary.invoiceCount === 0) {
    warnings.push({
      id: "dq-no-customer-invoices",
      severity: "Low",
      category: "Data Quality",
      title: "Customers without invoice activity",
      description: "No posted customer invoices this month.",
      impact: "Customer and realised margin warnings are limited.",
      confidence: "High",
      sourceData: "Customer invoices",
      recommendedAction: "Post customer invoices to strengthen detection.",
      href: "/customer-invoices",
      exposureValue: null,
    });
  }

  const inv = input.commandData?.inventory;
  if (inv && inv.inventoryValue > 0 && inv.slowMoving > 0) {
    warnings.push({
      id: "dq-inventory-no-movement",
      severity: "Medium",
      category: "Data Quality",
      title: "Inventory without recent movement",
      description: `${inv.slowMoving} stock item(s) flagged as slow-moving.`,
      impact: "Stale stock may indicate data or process gaps.",
      confidence: "High",
      sourceData: "Inventory · last_movement_at",
      recommendedAction: "Review stock ledger and post missing movements.",
      href: "/inventory/ledger",
      exposureValue: null,
    });
  }

  const { xeroConnection, invoiceSyncReady, xeroQueueFailed } = input;
  if (xeroConnection) {
    if (!xeroConnection.connected) {
      warnings.push({
        id: "dq-xero-not-connected",
        severity: "Medium",
        category: "Data Quality",
        title: "Xero not connected",
        description: "Accounting integration is not active for this workspace.",
        impact: "Financial close and sync warnings cannot be fully validated.",
        confidence: "High",
        sourceData: "Xero connection",
        recommendedAction: "Connect Xero from the integration page.",
        href: "/integrations/xero",
        exposureValue: null,
      });
    }
    if (xeroConnection.status === "Token Expired") {
      warnings.push({
        id: "dq-xero-token-expired",
        severity: "Critical",
        category: "Data Quality",
        title: "Xero token expired",
        description: "Xero access token has expired.",
        impact: "Sync operations will fail until token is refreshed.",
        confidence: "High",
        sourceData: "Xero connection · token status",
        recommendedAction: "Refresh Xero token immediately.",
        href: "/integrations/xero",
        exposureValue: null,
      });
    }
    if (xeroConnection.pendingOrganisationSelection) {
      warnings.push({
        id: "dq-xero-org-not-selected",
        severity: "High",
        category: "Data Quality",
        title: "Xero organisation not selected",
        description: "Connected to Xero but no organisation is selected.",
        impact: "Sync cannot proceed until organisation is chosen.",
        confidence: "High",
        sourceData: "Xero connection · organisation",
        recommendedAction: "Select Xero organisation.",
        href: "/integrations/xero",
        exposureValue: null,
      });
    }
    if (!invoiceSyncReady && xeroConnection.connected) {
      warnings.push({
        id: "dq-xero-mapping-incomplete",
        severity: "High",
        category: "Data Quality",
        title: "Xero mapping incomplete",
        description: "Required sales account or VAT tax type mapping is missing.",
        impact: "Invoice sync to Xero is blocked.",
        confidence: "High",
        sourceData: "Xero mapping settings",
        recommendedAction: "Complete Xero account mapping.",
        href: "/integrations/xero",
        exposureValue: null,
      });
    }
    if (xeroQueueFailed > 0) {
      warnings.push({
        id: "dq-xero-queue-failures",
        severity: xeroQueueFailed >= 5 ? "Critical" : "High",
        category: "Data Quality",
        title: "Xero sync queue failures",
        description: `${xeroQueueFailed} failed item(s) in the Xero sync queue.`,
        impact: "Accounting data may be incomplete.",
        confidence: "High",
        sourceData: "Xero sync queue",
        recommendedAction: "Retry failed Xero sync items.",
        href: "/integrations/xero",
        exposureValue: null,
      });
    }
  }

  return warnings;
}

function buildCategoryCards(warnings: EarlyWarningItem[]): WarningCategoryCard[] {
  const categories: WarningCategory[] = [
    "Margin",
    "Supplier",
    "Inventory",
    "Procurement",
    "Manufacturing",
    "Customer",
    "Xero",
    "Data Quality",
  ];

  return categories.map((category) => {
    const items = warnings.filter((row) => row.category === category);
    return {
      id: category.toLowerCase().replace(/\s+/g, "-"),
      label: CATEGORY_LABELS[category],
      count: items.length,
      highestSeverity: highestSeverity(items),
      mainIssue: items.length
        ? items.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])[0].title
        : "No active warnings",
      href: CATEGORY_HREFS[category],
    };
  });
}

function buildPriorityActions(warnings: EarlyWarningItem[]): PriorityAction[] {
  return [...warnings]
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
    .slice(0, 10)
    .map((warning, index) => ({
      id: `action-${warning.id}`,
      priority: index + 1,
      severity: warning.severity,
      title: warning.recommendedAction,
      explanation: warning.description,
      outcome: warning.impact,
      href: warning.href,
    }));
}

function buildTopRisks(warnings: EarlyWarningItem[]): TopRiskItem[] {
  return [...warnings]
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
    .slice(0, 10)
    .map((warning) => ({
      id: `risk-${warning.id}`,
      risk: warning.title,
      severity: warning.severity,
      businessImpact: warning.impact,
      confidence: warning.confidence,
      recommendedResponse: warning.recommendedAction,
      href: warning.href,
    }));
}

export function computeEarlyWarningSnapshot(input: EarlyWarningInput): EarlyWarningSnapshot {
  const operationalWarnings = [
    ...buildMarginWarnings(input.intelligence),
    ...buildSupplierWarnings(input.intelligence),
    ...buildInventoryWarnings(input),
    ...buildProcurementWarnings(input),
    ...buildManufacturingWarnings(input),
    ...buildCustomerWarnings(input),
    ...buildXeroWarnings(input),
  ];

  const dataQualityWarnings = buildDataQualityWarnings(input);

  const warnings = [...operationalWarnings, ...dataQualityWarnings].sort(
    (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
  );

  const potentialExposure = computePotentialExposure(input, warnings);

  const hasMonitoringData =
    Boolean(input.intelligence?.products.length) ||
    Boolean(input.commandData) ||
    Boolean(input.invoiceSummary?.invoiceCount) ||
    Boolean(input.xeroConnection) ||
    Boolean(input.recipeQuality?.totalRecipes);

  return {
    summary: {
      critical: warnings.filter((row) => row.severity === "Critical").length,
      high: warnings.filter((row) => row.severity === "High").length,
      medium: warnings.filter((row) => row.severity === "Medium").length,
      low: warnings.filter((row) => row.severity === "Low").length,
      potentialExposure,
      exposureLabel: potentialExposure != null ? money(potentialExposure) : "Exposure Not Yet Measurable",
    },
    warnings,
    categoryCards: buildCategoryCards(warnings),
    priorityActions: buildPriorityActions(warnings),
    dataQualityWarnings,
    topRisks: buildTopRisks(warnings),
    hasMonitoringData,
  };
}
