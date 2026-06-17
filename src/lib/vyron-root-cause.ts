import { computeBusinessHealthSnapshot, type BusinessHealthSnapshot } from "@/lib/vyron-business-health";
import {
  computeEarlyWarningSnapshot,
  type EarlyWarningInput,
  type EarlyWarningItem,
  type EarlyWarningSnapshot,
  type WarningCategory,
  type WarningConfidence,
  type WarningSeverity,
} from "@/lib/vyron-early-warning";
import { computePredictiveRiskSnapshot, type PredictiveRiskSnapshot } from "@/lib/vyron-predictive-risk";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";

export type RootCauseSeverity = WarningSeverity;
export type RootCauseConfidence = WarningConfidence;
export type RootCauseCategory = WarningCategory;

export type RootCauseClusterLabel =
  | "Pricing Issues"
  | "Supplier Issues"
  | "Inventory Issues"
  | "Manufacturing Issues"
  | "Customer Issues"
  | "Financial Visibility Issues"
  | "Data Quality Issues";

export type RootCauseInvestigation = {
  id: string;
  problem: string;
  rootCause: string;
  category: RootCauseCategory;
  evidence: string[];
  confidence: RootCauseConfidence;
  estimatedImpact: string;
  recommendedResolution: string;
  href: string;
  severity: RootCauseSeverity;
  exposureValue: number | null;
};

export type CauseTreeNode = {
  label: string;
  detail?: string;
};

export type CauseTree = {
  id: string;
  title: string;
  category: RootCauseCategory;
  nodes: CauseTreeNode[];
  href: string;
  severity: RootCauseSeverity;
};

export type RootCauseCluster = {
  id: string;
  label: RootCauseClusterLabel;
  problemCount: number;
  severity: RootCauseSeverity | "None";
  exposure: number | null;
  exposureLabel: string;
  href: string;
};

export type EvidenceItem = {
  id: string;
  label: string;
  value: string;
  category: RootCauseCategory;
  investigationId: string;
  href: string;
};

export type CorrectiveAction = {
  id: string;
  priority: number;
  rootCause: string;
  action: string;
  expectedImprovement: string;
  href: string;
};

export type RecurringCauseSource = "Early Warning" | "Predictive Risk" | "Business Health";

export type RecurringCause = {
  id: string;
  cause: string;
  frequency: number;
  severity: RootCauseSeverity;
  sources: RecurringCauseSource[];
  href: string;
};

export type RootCauseSnapshot = {
  summary: {
    criticalRootCauses: number;
    highImpactCauses: number;
    categoriesAffected: number;
    estimatedExposure: number | null;
    exposureLabel: string;
    confidenceLevel: RootCauseConfidence;
  };
  investigations: RootCauseInvestigation[];
  causeTrees: CauseTree[];
  clusters: RootCauseCluster[];
  evidence: EvidenceItem[];
  correctiveActions: CorrectiveAction[];
  recurringCauses: RecurringCause[];
  hasAnalysisData: boolean;
};

export type RootCauseInput = EarlyWarningInput;

const SEVERITY_WEIGHT: Record<RootCauseSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const CATEGORY_HREFS: Record<RootCauseCategory, string> = {
  Margin: "/cost-intelligence",
  Supplier: "/suppliers",
  Inventory: "/inventory/stock",
  Procurement: "/purchase-orders",
  Manufacturing: "/manufacturing",
  Customer: "/customer-invoices",
  Xero: "/integrations/xero",
  "Data Quality": "/products",
};

const CLUSTER_BY_CATEGORY: Record<RootCauseCategory, RootCauseClusterLabel> = {
  Margin: "Pricing Issues",
  Supplier: "Supplier Issues",
  Inventory: "Inventory Issues",
  Procurement: "Supplier Issues",
  Manufacturing: "Manufacturing Issues",
  Customer: "Customer Issues",
  Xero: "Financial Visibility Issues",
  "Data Quality": "Data Quality Issues",
};

const CLUSTER_HREFS: Record<RootCauseClusterLabel, string> = {
  "Pricing Issues": "/reports/product-margins",
  "Supplier Issues": "/suppliers",
  "Inventory Issues": "/inventory/stock",
  "Manufacturing Issues": "/manufacturing",
  "Customer Issues": "/customer-invoices",
  "Financial Visibility Issues": "/integrations/xero",
  "Data Quality Issues": "/products",
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function highestSeverity(items: RootCauseInvestigation[]): RootCauseSeverity | "None" {
  if (!items.length) return "None";
  return items.reduce(
    (best, item) => (SEVERITY_WEIGHT[item.severity] > SEVERITY_WEIGHT[best] ? item.severity : best),
    items[0].severity
  );
}

function hasSupplierInflation(intelligence: TenantCostIntelligence | null) {
  return Boolean(intelligence?.supplierInflation.length);
}

function belowGpProducts(intelligence: TenantCostIntelligence | null) {
  return (intelligence?.products || []).filter((row) => Number(row.gp_gap ?? 0) < 0);
}

function missingCostProducts(intelligence: TenantCostIntelligence | null) {
  return (intelligence?.products || []).filter((row) => !Number(row.total_cost));
}

function missingPriceProducts(intelligence: TenantCostIntelligence | null) {
  return (intelligence?.products || []).filter((row) => !Number(row.selling_price));
}

function deriveRootCause(
  warning: EarlyWarningItem,
  input: RootCauseInput,
  intelligence: TenantCostIntelligence | null
): { rootCause: string; evidence: string[] } {
  const inflation = intelligence?.supplierInflation || [];
  const belowGp = belowGpProducts(intelligence);
  const missingCost = missingCostProducts(intelligence);
  const missingPrice = missingPriceProducts(intelligence);

  switch (warning.id) {
    case "margin-critical-below-gp":
    case "margin-below-gp": {
      if (hasSupplierInflation(intelligence) && belowGp.length > 0) {
        const topSupplier = inflation[0];
        return {
          rootCause: "Supplier cost increases not offset by selling price adjustments",
          evidence: [
            `${belowGp.length} product(s) below target GP`,
            topSupplier
              ? `Supplier ${topSupplier.supplierName}: ${pct(topSupplier.movementPct)} price movement`
              : `${inflation.length} supplier(s) with recorded price movement`,
            "Selling prices unchanged on affected below-target products",
          ],
        };
      }
      return {
        rootCause: "Products priced below target GP without cost recovery or repricing",
        evidence: [
          `${belowGp.length} product(s) below target GP`,
          belowGp[0]
            ? `${belowGp[0].product_name}: actual GP ${pct(Number(belowGp[0].actual_gp))} vs target ${pct(Number(belowGp[0].target_gp))}`
            : "GP gap recorded on product margin intelligence",
        ],
      };
    }
    case "margin-missing-price":
      return {
        rootCause: "Incomplete product master — selling prices not recorded",
        evidence: [
          `${missingPrice.length} product(s) without selling price`,
          "Margin and GP analysis cannot be validated without selling prices",
        ],
      };
    case "margin-missing-cost":
    case "dq-missing-cost":
      return {
        rootCause: "Incomplete product costing — BOM or ingredient costs not recorded",
        evidence: [
          `${missingCost.length} product(s) without total cost`,
          "GP calculations may be incorrect or incomplete",
        ],
      };
    case "supplier-critical-inflation":
    case "supplier-inflation": {
      const top = inflation.slice(0, 3);
      return {
        rootCause: "Recorded supplier price movement increasing input costs",
        evidence: top.map(
          (row) => `${row.supplierName}: ${pct(row.movementPct)} movement · ${money(row.monthlyExposure)}/month exposure`
        ),
      };
    }
    case "inventory-slow-moving": {
      const inv = input.commandData?.inventory;
      return {
        rootCause: "Stock items without recent movement — working capital tied up",
        evidence: [
          `${inv?.slowMoving ?? 0} slow-moving SKU(s) on record`,
          inv && inv.inventoryValue > 0 ? `Inventory book value ${money(inv.inventoryValue)}` : "Slow-moving rules triggered",
        ],
      };
    }
    case "inventory-negative-stock":
      return {
        rootCause: "Stock ledger integrity failure — negative on-hand quantities",
        evidence: [
          `${input.commandData?.inventory.negativeStockRisks ?? 0} item(s) with negative stock`,
          "Stock movements or posting sequence may be out of balance",
        ],
      };
    case "inventory-low-stock":
      return {
        rootCause: "Replenishment gap — stock below reorder levels",
        evidence: [`${input.commandData?.inventory.lowStock ?? 0} SKU(s) below reorder level`],
      };
    case "inventory-overstock":
      return {
        rootCause: "Purchasing above maximum stock levels",
        evidence: [`${input.commandData?.inventory.overstock ?? 0} SKU(s) above maximum levels`],
      };
    case "procurement-po-variance":
      return {
        rootCause: "Ordered vs received pricing mismatch on purchase orders",
        evidence: [`${input.commandData?.procurement.poVariances ?? 0} PO variance(s) detected`],
      };
    case "procurement-open-pos":
      return {
        rootCause: "Open purchase order backlog affecting cost planning and fulfilment",
        evidence: [`${input.commandData?.procurement.openPos ?? 0} open PO(s) on record`],
      };
    case "manufacturing-wastage": {
      const mfg = input.commandData?.manufacturing;
      return {
        rootCause: "Manufacturing wastage above acceptable threshold",
        evidence: [
          mfg ? `Wastage ${pct(mfg.wastagePct)} · Yield ${pct(mfg.yieldPct)}` : "Elevated wastage on manufacturing intelligence",
        ],
      };
    }
    case "manufacturing-bom-movement": {
      const movement = intelligence?.bomCostMovement.slice(0, 3) || [];
      return {
        rootCause: "Ingredient cost movement flowing into finished product costs",
        evidence: movement.length
          ? movement.map(
              (row) => `${row.productName}: ${pct(row.movementPct)} cost movement (${money(row.previousCost)} → ${money(row.currentCost)})`
            )
          : [`${intelligence?.bomCostMovement.length ?? 0} ingredient(s) with cost movement`],
      };
    }
    case "manufacturing-low-yield": {
      const mfg = input.commandData?.manufacturing;
      return {
        rootCause: "Production yield below target — higher input cost per finished unit",
        evidence: [mfg ? `Yield at ${pct(mfg.yieldPct)} on recent runs` : "Low yield recorded on manufacturing data"],
      };
    }
    case "customer-low-gp": {
      const inv = input.invoiceSummary;
      return {
        rootCause: "Realised invoice margin below healthy threshold on posted sales",
        evidence: [
          inv ? `Month GP ${pct(inv.monthlyGpPct)} across ${inv.invoiceCount} invoice(s)` : "Low invoice GP on record",
          inv && inv.monthlySales > 0 ? `Posted sales ${money(inv.monthlySales)}` : "Posted invoice activity on record",
        ],
      };
    }
    case "customer-concentration":
      return {
        rootCause: "Revenue concentrated in a single customer account",
        evidence: [
          `${input.invoiceSummary?.invoiceCount ?? 0} invoice(s) to ${input.invoiceSummary?.uniqueCustomers ?? 0} customer(s) this month`,
        ],
      };
    case "xero-disconnected":
    case "xero-token-expired":
    case "xero-org-not-selected":
    case "xero-mapping-incomplete":
    case "xero-sync-failures":
    case "xero-sync-backlog":
    case "dq-xero-not-connected":
    case "dq-xero-token-expired":
    case "dq-xero-org-not-selected":
    case "dq-xero-mapping-incomplete":
    case "dq-xero-queue-failures":
      return {
        rootCause: mapXeroRootCause(warning.id),
        evidence: buildXeroEvidence(warning, input),
      };
    case "dq-bom-missing-ingredients":
      return {
        rootCause: "Incomplete BOM structures — ingredient lines missing",
        evidence: [
          `${input.recipeQuality?.recipesWithoutLines ?? 0} recipe/BOM(s) without ingredient lines`,
        ],
      };
    case "dq-bom-missing-costing":
      return {
        rootCause: "Incomplete BOM costing — total recipe cost not calculated",
        evidence: [
          `${input.recipeQuality?.recipesWithoutCosting ?? 0} recipe/BOM(s) with zero or missing total cost`,
        ],
      };
    case "dq-no-products":
      return {
        rootCause: "Product master not established for this company",
        evidence: ["No products on record — margin and cost analysis unavailable"],
      };
    case "dq-missing-price":
      return {
        rootCause: "Incomplete product master — selling prices not recorded",
        evidence: [`${missingPrice.length} product(s) without selling price`],
      };
    case "dq-supplier-pricing-history":
      return {
        rootCause: "Supplier pricing history not maintained despite procurement activity",
        evidence: ["Procurement activity exists without recorded supplier price movement"],
      };
    case "dq-no-customer-invoices":
      return {
        rootCause: "No posted customer invoice activity — profitability signals unavailable",
        evidence: ["No posted customer invoices this month"],
      };
    case "dq-inventory-no-movement":
      return {
        rootCause: "Inventory movement data stale or incomplete",
        evidence: [`${input.commandData?.inventory.slowMoving ?? 0} item(s) flagged as slow-moving`],
      };
    default:
      return {
        rootCause: warning.recommendedAction,
        evidence: [warning.description, warning.sourceData],
      };
  }
}

function mapXeroRootCause(warningId: string): string {
  const map: Record<string, string> = {
    "xero-disconnected": "Xero accounting integration not connected",
    "xero-token-expired": "Xero access token expired — sync cannot proceed",
    "xero-org-not-selected": "Xero organisation not selected after OAuth",
    "xero-mapping-incomplete": "Required Xero account mapping incomplete",
    "xero-sync-failures": "Failed items accumulating in Xero sync queue",
    "xero-sync-backlog": "Xero sync backlog delaying financial posting",
    "dq-xero-not-connected": "Xero not connected — financial visibility limited",
    "dq-xero-token-expired": "Expired Xero token blocking sync operations",
    "dq-xero-org-not-selected": "Xero organisation selection incomplete",
    "dq-xero-mapping-incomplete": "Xero mapping gaps blocking invoice sync",
    "dq-xero-queue-failures": "Xero sync queue failures creating accounting gaps",
  };
  return map[warningId] || "Xero integration health degraded";
}

function buildXeroEvidence(warning: EarlyWarningItem, input: RootCauseInput): string[] {
  const evidence = [warning.description, warning.sourceData];
  if (input.xeroQueueFailed > 0) evidence.push(`${input.xeroQueueFailed} failed sync queue item(s)`);
  if (input.xeroQueueReady > 0) evidence.push(`${input.xeroQueueReady} item(s) waiting in sync queue`);
  if (input.xeroConnection?.status) evidence.push(`Connection status: ${input.xeroConnection.status}`);
  return evidence.filter(Boolean);
}

function warningToInvestigation(
  warning: EarlyWarningItem,
  input: RootCauseInput,
  intelligence: TenantCostIntelligence | null
): RootCauseInvestigation {
  const { rootCause, evidence } = deriveRootCause(warning, input, intelligence);
  return {
    id: `rc-${warning.id}`,
    problem: warning.title,
    rootCause,
    category: warning.category,
    evidence,
    confidence: warning.confidence,
    estimatedImpact: warning.impact,
    recommendedResolution: warning.recommendedAction,
    href: warning.href,
    severity: warning.severity,
    exposureValue: warning.exposureValue,
  };
}

function buildCauseTrees(
  input: RootCauseInput,
  warnings: EarlyWarningItem[],
  intelligence: TenantCostIntelligence | null
): CauseTree[] {
  const trees: CauseTree[] = [];
  const belowGp = belowGpProducts(intelligence);
  const inflation = intelligence?.supplierInflation || [];
  const missingCost = missingCostProducts(intelligence);
  const missingPrice = missingPriceProducts(intelligence);

  if (belowGp.length > 0 && inflation.length > 0) {
    const topSupplier = inflation[0];
    trees.push({
      id: "tree-margin-supplier-price",
      title: "Margin erosion from supplier inflation",
      category: "Margin",
      nodes: [
        { label: "Margin Erosion", detail: `${belowGp.length} product(s) below target GP` },
        { label: "Supplier Inflation", detail: `${inflation.length} supplier(s) with price movement` },
        {
          label: "Ingredient Cost Increase",
          detail: `${topSupplier.supplierName}: ${pct(topSupplier.movementPct)} movement`,
        },
        { label: "Selling Price Unchanged", detail: "No repricing recorded on affected products" },
      ],
      href: "/cost-intelligence",
      severity: belowGp.some((row) => row.risk_level === "Critical") ? "Critical" : "High",
    });
  } else if (belowGp.length > 0 && missingCost.length > 0) {
    trees.push({
      id: "tree-margin-missing-cost",
      title: "Margin erosion from incomplete costing",
      category: "Margin",
      nodes: [
        { label: "Margin Erosion", detail: `${belowGp.length} product(s) below target GP` },
        { label: "Missing Product Cost", detail: `${missingCost.length} product(s) without total cost` },
        { label: "Incorrect GP Calculation", detail: "True margin cannot be validated without complete BOM costs" },
      ],
      href: "/recipes",
      severity: "High",
    });
  } else if (belowGp.length > 0 && missingPrice.length > 0) {
    trees.push({
      id: "tree-margin-missing-price",
      title: "Margin erosion from missing prices",
      category: "Margin",
      nodes: [
        { label: "Margin Erosion", detail: `${belowGp.length} product(s) below target GP` },
        { label: "Missing Selling Price", detail: `${missingPrice.length} product(s) without selling price` },
        { label: "GP Analysis Blocked", detail: "Target GP comparison unavailable on incomplete products" },
      ],
      href: "/products",
      severity: "Medium",
    });
  }

  if (warnings.some((row) => row.id === "inventory-slow-moving" || row.id === "inventory-overstock")) {
    const inv = input.commandData?.inventory;
    trees.push({
      id: "tree-inventory-exposure",
      title: "Inventory exposure growth",
      category: "Inventory",
      nodes: [
        { label: "Inventory Exposure", detail: inv && inv.inventoryValue > 0 ? money(inv.inventoryValue) : "Slow/overstock signals active" },
        { label: "Slow Movement", detail: `${inv?.slowMoving ?? 0} slow-moving SKU(s)` },
        { label: "Working Capital Pressure", detail: "Stock carrying risk increasing without movement or sell-through" },
      ],
      href: "/inventory/stock",
      severity: (inv?.slowMoving ?? 0) >= 5 ? "High" : "Medium",
    });
  }

  if (
    warnings.some(
      (row) =>
        row.id.startsWith("xero-") ||
        row.id.startsWith("dq-xero-")
    )
  ) {
    trees.push({
      id: "tree-xero-visibility",
      title: "Financial visibility degradation",
      category: "Xero",
      nodes: [
        { label: "Financial Visibility Risk", detail: "Accounting sync or mapping issues on record" },
        {
          label: input.xeroQueueFailed > 0 ? "Sync Queue Failures" : "Mapping / Connection Gap",
          detail:
            input.xeroQueueFailed > 0
              ? `${input.xeroQueueFailed} failed queue item(s)`
              : input.invoiceSyncReady
                ? "Connection active"
                : "Invoice mapping incomplete",
        },
        { label: "Operational vs Accounting Gap", detail: "Posted operational data may not match Xero records" },
      ],
      href: "/integrations/xero",
      severity: input.xeroQueueFailed >= 5 || input.xeroConnection?.status === "Token Expired" ? "Critical" : "High",
    });
  }

  if (warnings.some((row) => row.id === "manufacturing-bom-movement" || row.id === "manufacturing-wastage")) {
    const mfg = input.commandData?.manufacturing;
    trees.push({
      id: "tree-manufacturing-cost",
      title: "Manufacturing cost pressure",
      category: "Manufacturing",
      nodes: [
        { label: "Finished Goods Cost Pressure", detail: "Manufacturing signals elevated on record" },
        {
          label: warnings.some((row) => row.id === "manufacturing-wastage") ? "Elevated Wastage" : "BOM Cost Movement",
          detail: mfg
            ? `Wastage ${pct(mfg.wastagePct)} · Yield ${pct(mfg.yieldPct)}`
            : `${intelligence?.bomCostMovement.length ?? 0} ingredient cost movement(s)`,
        },
        { label: "Margin Compression", detail: "Input cost per finished unit likely increasing" },
      ],
      href: "/manufacturing",
      severity: mfg && mfg.wastagePct >= 10 ? "Critical" : "High",
    });
  }

  if (warnings.some((row) => row.id === "customer-low-gp") && belowGp.length > 0) {
    trees.push({
      id: "tree-customer-margin",
      title: "Profitability decline",
      category: "Customer",
      nodes: [
        { label: "Profitability Falling", detail: `Invoice GP ${pct(input.invoiceSummary?.monthlyGpPct ?? 0)}` },
        { label: "Product Margin Pressure", detail: `${belowGp.length} product(s) below target GP` },
        { label: "Weak Realised Margin", detail: "Posted invoice mix reflects below-target product margins" },
      ],
      href: "/customer-invoices",
      severity: (input.invoiceSummary?.monthlyGpPct ?? 100) < 25 ? "Critical" : "High",
    });
  }

  return trees;
}

function buildClusters(investigations: RootCauseInvestigation[]): RootCauseCluster[] {
  const labels: RootCauseClusterLabel[] = [
    "Pricing Issues",
    "Supplier Issues",
    "Inventory Issues",
    "Manufacturing Issues",
    "Customer Issues",
    "Financial Visibility Issues",
    "Data Quality Issues",
  ];

  return labels.map((label) => {
    const items = investigations.filter((row) => CLUSTER_BY_CATEGORY[row.category] === label);
    const exposure = items.reduce((sum, row) => sum + Number(row.exposureValue || 0), 0);
    return {
      id: label.toLowerCase().replace(/\s+/g, "-"),
      label,
      problemCount: items.length,
      severity: highestSeverity(items),
      exposure: exposure > 0 ? Math.round(exposure) : null,
      exposureLabel: exposure > 0 ? money(exposure) : "Not yet measurable",
      href: CLUSTER_HREFS[label],
    };
  });
}

function buildEvidenceCentre(investigations: RootCauseInvestigation[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  investigations.forEach((inv) => {
    inv.evidence.forEach((value, index) => {
      items.push({
        id: `evidence-${inv.id}-${index}`,
        label: inv.problem,
        value,
        category: inv.category,
        investigationId: inv.id,
        href: inv.href,
      });
    });
  });
  return items;
}

function buildCorrectiveActions(investigations: RootCauseInvestigation[]): CorrectiveAction[] {
  return [...investigations]
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
    .slice(0, 10)
    .map((row, index) => ({
      id: `corrective-${row.id}`,
      priority: index + 1,
      rootCause: row.rootCause,
      action: row.recommendedResolution,
      expectedImprovement: row.estimatedImpact,
      href: row.href,
    }));
}

const RECURRING_CAUSE_MAP: Array<{
  id: string;
  cause: string;
  warningIds: string[];
  href: string;
}> = [
  {
    id: "recurring-missing-costs",
    cause: "Missing costs",
    warningIds: ["margin-missing-cost", "dq-missing-cost", "dq-bom-missing-costing"],
    href: "/recipes",
  },
  {
    id: "recurring-missing-prices",
    cause: "Missing selling prices",
    warningIds: ["margin-missing-price", "dq-missing-price"],
    href: "/products",
  },
  {
    id: "recurring-supplier-inflation",
    cause: "Supplier inflation",
    warningIds: ["supplier-critical-inflation", "supplier-inflation"],
    href: "/suppliers",
  },
  {
    id: "recurring-mapping-failures",
    cause: "Xero mapping failures",
    warningIds: ["xero-mapping-incomplete", "dq-xero-mapping-incomplete"],
    href: "/integrations/xero",
  },
  {
    id: "recurring-xero-sync",
    cause: "Xero sync failures",
    warningIds: ["xero-sync-failures", "dq-xero-queue-failures"],
    href: "/integrations/xero",
  },
  {
    id: "recurring-below-gp",
    cause: "Products below target GP",
    warningIds: ["margin-critical-below-gp", "margin-below-gp"],
    href: "/reports/product-margins",
  },
  {
    id: "recurring-bom-gaps",
    cause: "Incomplete BOM structures",
    warningIds: ["dq-bom-missing-ingredients", "dq-bom-missing-costing"],
    href: "/recipes",
  },
  {
    id: "recurring-inventory-exposure",
    cause: "Inventory exposure",
    warningIds: ["inventory-slow-moving", "inventory-overstock", "dq-inventory-no-movement"],
    href: "/inventory/stock",
  },
];

function buildRecurringCauses(
  warningSnapshot: EarlyWarningSnapshot,
  predictiveSnapshot: PredictiveRiskSnapshot,
  healthSnapshot: BusinessHealthSnapshot
): RecurringCause[] {
  const warningIds = new Set(warningSnapshot.warnings.map((row) => row.id));
  const forecastRisks = new Set(predictiveSnapshot.forecastedRisks.map((row) => row.risk.toLowerCase()));
  const healthIssues = new Set(
    healthSnapshot.topRisks.map((row) => row.title.toLowerCase()).concat(
      healthSnapshot.actions.map((row) => row.title.toLowerCase())
    )
  );

  const results: RecurringCause[] = [];

  for (const entry of RECURRING_CAUSE_MAP) {
    const sources: RecurringCauseSource[] = [];
    const matchedWarnings = entry.warningIds.filter((id) => warningIds.has(id));
    if (matchedWarnings.length > 0) sources.push("Early Warning");

    const causeLower = entry.cause.toLowerCase();
    if (
      [...forecastRisks].some(
        (risk) => risk.includes(causeLower.split(" ")[0]) || (causeLower.includes("margin") && risk.includes("margin"))
      )
    ) {
      sources.push("Predictive Risk");
    }
    if ([...healthIssues].some((issue) => issue.includes(causeLower.split(" ")[0]))) {
      sources.push("Business Health");
    }

    if (matchedWarnings.length === 0 && sources.length === 0) continue;

    const matchedWarningItems = warningSnapshot.warnings.filter((row) => entry.warningIds.includes(row.id));
    const severity =
      matchedWarningItems.length > 0
        ? matchedWarningItems.reduce(
            (best, row) => (SEVERITY_WEIGHT[row.severity] > SEVERITY_WEIGHT[best] ? row.severity : best),
            matchedWarningItems[0].severity
          )
        : "Medium";

    results.push({
      id: entry.id,
      cause: entry.cause,
      frequency:
        matchedWarnings.length +
        (sources.includes("Predictive Risk") ? 1 : 0) +
        (sources.includes("Business Health") ? 1 : 0),
      severity,
      sources: sources.length ? sources : ["Early Warning"],
      href: entry.href,
    });
  }

  return results.sort(
    (a, b) => b.frequency - a.frequency || SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
  );
}

function computeConfidenceLevel(
  warningSnapshot: EarlyWarningSnapshot,
  investigations: RootCauseInvestigation[]
): RootCauseConfidence {
  if (!warningSnapshot.hasMonitoringData) return "Low";
  const highConf = investigations.filter((row) => row.confidence === "High").length;
  if (investigations.length === 0) return "Medium";
  if (highConf / investigations.length >= 0.6) return "High";
  if (highConf / investigations.length >= 0.3) return "Medium";
  return "Low";
}

function dedupeInvestigations(investigations: RootCauseInvestigation[]): RootCauseInvestigation[] {
  const seen = new Set<string>();
  const result: RootCauseInvestigation[] = [];
  for (const row of investigations) {
    const key = `${row.category}:${row.rootCause}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
}

export function computeRootCauseSnapshot(input: RootCauseInput): RootCauseSnapshot {
  const warningSnapshot = computeEarlyWarningSnapshot(input);
  const healthSnapshot = computeBusinessHealthSnapshot(input);
  const predictiveSnapshot = computePredictiveRiskSnapshot(input);
  const intelligence = input.intelligence;

  const rawInvestigations = warningSnapshot.warnings.map((warning) =>
    warningToInvestigation(warning, input, intelligence)
  );
  const investigations = dedupeInvestigations(rawInvestigations);
  const causeTrees = buildCauseTrees(input, warningSnapshot.warnings, intelligence);
  const clusters = buildClusters(investigations);
  const evidence = buildEvidenceCentre(investigations);
  const correctiveActions = buildCorrectiveActions(investigations);
  const recurringCauses = buildRecurringCauses(warningSnapshot, predictiveSnapshot, healthSnapshot);

  const exposure = warningSnapshot.summary.potentialExposure;
  const categoriesAffected = new Set(investigations.map((row) => row.category)).size;

  return {
    summary: {
      criticalRootCauses: investigations.filter((row) => row.severity === "Critical").length,
      highImpactCauses: investigations.filter((row) => row.severity === "High").length,
      categoriesAffected,
      estimatedExposure: exposure,
      exposureLabel: exposure != null ? warningSnapshot.summary.exposureLabel : "Exposure Not Yet Measurable",
      confidenceLevel: computeConfidenceLevel(warningSnapshot, investigations),
    },
    investigations,
    causeTrees,
    clusters,
    evidence,
    correctiveActions,
    recurringCauses,
    hasAnalysisData: warningSnapshot.hasMonitoringData,
  };
}
