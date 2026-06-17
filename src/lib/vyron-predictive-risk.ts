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

export type ForecastSeverity = WarningSeverity;
export type ForecastConfidence = WarningConfidence;

export type ForecastedRisk = {
  id: string;
  risk: string;
  category: WarningCategory;
  currentStatus: string;
  forecastedOutcome: string;
  severity: ForecastSeverity;
  confidence: ForecastConfidence;
  forecastHorizon: string;
  recommendedAction: string;
  href: string;
  sourceSignals: string[];
};

export type PredictiveModel = {
  id: string;
  title: string;
  category: WarningCategory;
  conditions: string[];
  forecast: string;
  confidence: ForecastConfidence;
  href: string;
};

export type FutureRiskItem = {
  id: string;
  risk: string;
  severity: ForecastSeverity;
  confidence: ForecastConfidence;
  expectedImpact: string;
  timeHorizon: string;
  recommendedResponse: string;
  href: string;
};

export type ScenarioItem = {
  id: string;
  title: "Best Case" | "Expected Case" | "Worst Case";
  summary: string;
  signals: string[];
};

export type HeatmapRisk = {
  id: string;
  label: string;
  category: WarningCategory;
  likelihood: "Low" | "Medium" | "High";
  impact: "Low" | "Medium" | "High" | "Critical";
  href: string;
};

export type PreventiveAction = {
  id: string;
  priority: number;
  title: string;
  whyItMatters: string;
  expectedBenefit: string;
  href: string;
};

export type PredictiveRiskSnapshot = {
  summary: {
    criticalForecastRisks: number;
    highForecastRisks: number;
    forecastExposure: number | null;
    forecastExposureLabel: string;
    confidenceLevel: ForecastConfidence;
    forecastHorizon: string;
    outlookLabel: string;
  };
  forecastedRisks: ForecastedRisk[];
  models: PredictiveModel[];
  topFutureRisks: FutureRiskItem[];
  scenarios: ScenarioItem[];
  heatmap: HeatmapRisk[];
  preventiveActions: PreventiveAction[];
  hasForecastData: boolean;
};

export type PredictiveRiskInput = EarlyWarningInput;

const FORECAST_HORIZON = "30 Days";
const OUTLOOK_LABEL = "30 Day Outlook";

const SEVERITY_WEIGHT: Record<ForecastSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function warningsInCategory(warnings: EarlyWarningItem[], category: WarningCategory) {
  return warnings.filter((row) => row.category === category);
}

function highestSeverityIn(items: EarlyWarningItem[]): ForecastSeverity | null {
  if (!items.length) return null;
  return items.reduce(
    (best, item) => (SEVERITY_WEIGHT[item.severity] > SEVERITY_WEIGHT[best] ? item.severity : best),
    items[0].severity
  );
}

function deriveForecastOutcome(warning: EarlyWarningItem): string {
  const byId: Record<string, string> = {
    "margin-critical-below-gp":
      "Margin likely to decline further over the next 30 days if products remain below target GP.",
    "margin-below-gp":
      "Continued GP pressure expected unless selling prices or costs are corrected within the forecast horizon.",
    "margin-missing-price":
      "Margin visibility and recovery actions likely to remain blocked until selling prices are completed.",
    "margin-missing-cost":
      "True margin risk may be understated until BOM costs are completed on affected products.",
    "margin-repricing-review":
      "Margin protection opportunity may be lost if suggested repricing is not actioned before supplier costs move.",
    "supplier-critical-inflation":
      "Procurement costs likely to continue rising and compress finished product margin without renegotiation.",
    "supplier-inflation":
      "Supplier cost pressure likely to flow into product costs if purchase pricing is not reviewed.",
    "inventory-negative-stock":
      "Stock integrity issues likely to cause fulfilment and posting errors if unresolved.",
    "inventory-low-stock":
      "Stock-out risk likely to increase on affected SKUs within the forecast horizon.",
    "inventory-slow-moving":
      "Stock carrying risk likely to increase if slow movement patterns continue unchanged.",
    "inventory-overstock":
      "Holding cost and obsolescence exposure likely to grow while overstock positions persist.",
    "procurement-po-variance":
      "Cost leakage between ordered and received pricing likely to continue on open procurement cycles.",
    "procurement-open-pos":
      "Procurement fulfilment delays or uncommitted spend likely to affect cost planning through the horizon.",
    "manufacturing-wastage":
      "Batch cost and finished goods margin likely to remain under pressure if wastage persists.",
    "manufacturing-bom-movement":
      "Finished product costs likely to shift further without BOM recalculation and repricing review.",
    "manufacturing-low-yield":
      "Input cost per finished unit likely to remain elevated if yield does not recover.",
    "customer-low-gp":
      "Realised customer margin likely to remain weak on current invoice mix if pricing is unchanged.",
    "customer-concentration":
      "Revenue concentration risk likely to persist while customer base remains narrow.",
    "xero-org-not-selected":
      "Accounting sync likely to remain blocked until a Xero organisation is selected.",
    "xero-disconnected":
      "Financial visibility gap likely to widen while Xero remains disconnected.",
    "xero-token-expired":
      "Sync failures likely to accumulate until the Xero token is refreshed.",
    "xero-mapping-incomplete":
      "Invoice posting to Xero likely to remain blocked until mapping is completed.",
    "xero-sync-failures":
      "Financial visibility risk likely to increase as failed sync items accumulate.",
    "xero-sync-backlog":
      "Month-end accounting visibility likely to lag operational activity while the sync backlog persists.",
    "dq-no-products":
      "Forecast accuracy likely to remain limited until product master data is established.",
    "dq-missing-cost":
      "Margin forecasts likely to remain incomplete until product costs are recorded.",
    "dq-missing-price":
      "Repricing and margin recovery forecasts likely to remain blocked until selling prices exist.",
    "dq-bom-missing-ingredients":
      "Product costing forecasts likely to remain unreliable until BOM ingredient lines are completed.",
    "dq-bom-missing-costing":
      "Finished product margin forecasts likely to remain incomplete until BOM costing is finished.",
    "dq-supplier-pricing-history":
      "Supplier inflation forecasts likely to under-detect until pricing history is maintained.",
    "dq-no-customer-invoices":
      "Customer profitability forecasts likely to remain limited without posted invoice activity.",
    "dq-inventory-no-movement":
      "Inventory exposure forecasts may miss stale stock until movement data is current.",
    "dq-xero-not-connected":
      "Financial close forecasts likely to rely on operational data only until Xero is connected.",
    "dq-xero-token-expired":
      "Accounting sync failures likely to increase until the Xero token is refreshed.",
    "dq-xero-org-not-selected":
      "Xero sync likely to remain stalled until an organisation is selected.",
    "dq-xero-mapping-incomplete":
      "Invoice sync forecasts indicate continued blockage until Xero mapping is resolved.",
    "dq-xero-queue-failures":
      "Financial data gaps likely to widen if failed Xero queue items are not retried.",
  };

  if (byId[warning.id]) return byId[warning.id];

  return `If current conditions persist, ${warning.title.toLowerCase()} is likely to continue affecting operations over the next 30 days.`;
}

function warningToForecast(warning: EarlyWarningItem): ForecastedRisk {
  return {
    id: `forecast-${warning.id}`,
    risk: warning.title,
    category: warning.category,
    currentStatus: warning.description,
    forecastedOutcome: deriveForecastOutcome(warning),
    severity: warning.severity,
    confidence: warning.confidence,
    forecastHorizon: FORECAST_HORIZON,
    recommendedAction: warning.recommendedAction,
    href: warning.href,
    sourceSignals: [warning.sourceData, warning.impact],
  };
}

function buildMarginModel(
  warnings: EarlyWarningItem[],
  intelligence: EarlyWarningInput["intelligence"]
): PredictiveModel | null {
  const marginWarnings = warningsInCategory(warnings, "Margin");
  const supplierWarnings = warningsInCategory(warnings, "Supplier");
  const belowGp = marginWarnings.some(
    (row) => row.id === "margin-below-gp" || row.id === "margin-critical-below-gp"
  );
  const supplierPressure = supplierWarnings.length > 0;
  const missingPrice = marginWarnings.some((row) => row.id === "margin-missing-price");
  const unchangedPrices =
    belowGp &&
    Boolean(intelligence?.products.some((row) => Number(row.gp_gap ?? 0) < 0 && Number(row.selling_price) > 0));

  if (!belowGp && !supplierPressure) return null;

  const conditions: string[] = [];
  if (belowGp) conditions.push("Products below target GP on record");
  if (supplierPressure) conditions.push("Supplier price movement detected");
  if (missingPrice) conditions.push("Selling prices missing on affected products");
  else if (unchangedPrices) conditions.push("Selling prices unchanged on below-target products");

  if (!conditions.length) return null;

  return {
    id: "model-margin-forecast",
    title: "Margin Forecast",
    category: "Margin",
    conditions,
    forecast:
      belowGp && supplierPressure
        ? "Margin likely to decline further if supplier costs rise while selling prices remain unchanged."
        : belowGp
          ? "Margin pressure likely to persist on below-target products through the forecast horizon."
          : "Supplier cost pressure likely to compress margin if selling prices are not reviewed.",
    confidence: belowGp && supplierPressure ? "High" : "Medium",
    href: "/cost-intelligence",
  };
}

function buildInventoryModel(warnings: EarlyWarningItem[], input: PredictiveRiskInput): PredictiveModel | null {
  const invWarnings = warningsInCategory(warnings, "Inventory");
  const slowMoving = invWarnings.some((row) => row.id === "inventory-slow-moving");
  const overstock = invWarnings.some((row) => row.id === "inventory-overstock");
  const exposure = input.commandData?.inventory;

  if (!slowMoving && !overstock && !(exposure && exposure.slowMoving > 0)) return null;

  const conditions: string[] = [];
  if (slowMoving || (exposure && exposure.slowMoving > 0)) {
    conditions.push(`${exposure?.slowMoving ?? "Multiple"} SKU(s) flagged as slow-moving`);
  }
  if (overstock) conditions.push("Overstock positions detected on record");
  if (exposure && exposure.inventoryValue > 0) {
    conditions.push(`Inventory book value ${money(exposure.inventoryValue)} on record`);
  }

  return {
    id: "model-inventory-forecast",
    title: "Inventory Forecast",
    category: "Inventory",
    conditions,
    forecast: "Stock carrying risk likely to increase if slow movement and overstock patterns continue unchanged.",
    confidence: slowMoving && (exposure?.slowMoving ?? 0) >= 3 ? "High" : "Medium",
    href: "/inventory/stock",
  };
}

function buildXeroModel(warnings: EarlyWarningItem[], input: PredictiveRiskInput): PredictiveModel | null {
  const xeroWarnings = warningsInCategory(warnings, "Xero");
  const mappingIncomplete = xeroWarnings.some((row) => row.id === "xero-mapping-incomplete");
  const syncFailures = xeroWarnings.some((row) => row.id === "xero-sync-failures");
  const backlog = xeroWarnings.some((row) => row.id === "xero-sync-backlog");
  const disconnected = xeroWarnings.some((row) => row.id === "xero-disconnected" || row.id === "xero-token-expired");

  if (!mappingIncomplete && !syncFailures && !backlog && !disconnected) return null;

  const conditions: string[] = [];
  if (mappingIncomplete || !input.invoiceSyncReady) conditions.push("Invoice mapping incomplete");
  if (syncFailures || input.xeroQueueFailed > 0) {
    conditions.push(`${input.xeroQueueFailed || "Multiple"} Xero sync queue failure(s) on record`);
  }
  if (backlog || input.xeroQueueReady >= 10) conditions.push("Xero sync backlog building");
  if (disconnected) conditions.push("Xero connection health degraded");

  return {
    id: "model-xero-forecast",
    title: "Xero Forecast",
    category: "Xero",
    conditions,
    forecast: "Financial visibility risk likely to increase if mapping, connection and sync issues persist.",
    confidence: syncFailures || input.xeroQueueFailed > 0 ? "High" : "Medium",
    href: "/integrations/xero",
  };
}

function buildProcurementModel(warnings: EarlyWarningItem[]): PredictiveModel | null {
  const procWarnings = warningsInCategory(warnings, "Procurement");
  if (!procWarnings.length) return null;

  return {
    id: "model-procurement-forecast",
    title: "Procurement Forecast",
    category: "Procurement",
    conditions: procWarnings.map((row) => row.description),
    forecast: "Procurement cost leakage likely to continue while PO variances and open PO pressure remain unresolved.",
    confidence: procWarnings.some((row) => row.severity === "Critical" || row.severity === "High") ? "High" : "Medium",
    href: "/purchase-orders",
  };
}

function buildManufacturingModel(warnings: EarlyWarningItem[]): PredictiveModel | null {
  const mfgWarnings = warningsInCategory(warnings, "Manufacturing");
  if (!mfgWarnings.length) return null;

  return {
    id: "model-manufacturing-forecast",
    title: "Manufacturing Forecast",
    category: "Manufacturing",
    conditions: mfgWarnings.map((row) => row.description),
    forecast: "Finished goods cost pressure likely to persist if wastage, yield or BOM movement signals continue.",
    confidence: mfgWarnings.some((row) => row.severity === "Critical" || row.severity === "High") ? "High" : "Medium",
    href: "/manufacturing",
  };
}

function buildCustomerModel(warnings: EarlyWarningItem[]): PredictiveModel | null {
  const customerWarnings = warningsInCategory(warnings, "Customer");
  if (!customerWarnings.length) return null;

  return {
    id: "model-customer-forecast",
    title: "Customer Forecast",
    category: "Customer",
    conditions: customerWarnings.map((row) => row.description),
    forecast: "Customer profitability and concentration risks likely to persist on the current invoice pattern.",
    confidence: customerWarnings.some((row) => row.confidence === "High") ? "High" : "Medium",
    href: "/customer-invoices",
  };
}

function buildDataQualityModel(warnings: EarlyWarningItem[]): PredictiveModel | null {
  const dqWarnings = warningsInCategory(warnings, "Data Quality");
  if (!dqWarnings.length) return null;

  return {
    id: "model-data-quality-forecast",
    title: "Data Quality Forecast",
    category: "Data Quality",
    conditions: dqWarnings.slice(0, 4).map((row) => row.title),
    forecast: "Forecast accuracy likely to remain limited until master data and integration gaps are closed.",
    confidence: dqWarnings.length >= 4 ? "High" : "Medium",
    href: "/products",
  };
}

function buildPredictiveModels(
  warnings: EarlyWarningItem[],
  input: PredictiveRiskInput
): PredictiveModel[] {
  return [
    buildMarginModel(warnings, input.intelligence),
    buildInventoryModel(warnings, input),
    buildXeroModel(warnings, input),
    buildProcurementModel(warnings),
    buildManufacturingModel(warnings),
    buildCustomerModel(warnings),
    buildDataQualityModel(warnings),
  ].filter((row): row is PredictiveModel => row != null);
}

function modelToForecast(model: PredictiveModel): ForecastedRisk {
  const severity: ForecastSeverity =
    model.confidence === "High" && model.category !== "Data Quality" ? "High" : "Medium";

  return {
    id: `forecast-${model.id}`,
    risk: model.title,
    category: model.category,
    currentStatus: model.conditions.join(" · "),
    forecastedOutcome: model.forecast,
    severity,
    confidence: model.confidence,
    forecastHorizon: FORECAST_HORIZON,
    recommendedAction: `Review ${model.category.toLowerCase()} signals and act before the ${FORECAST_HORIZON.toLowerCase()} horizon.`,
    href: model.href,
    sourceSignals: model.conditions,
  };
}

function buildScenarios(
  warnings: EarlyWarningItem[],
  health: BusinessHealthSnapshot
): ScenarioItem[] {
  const criticalWarnings = warnings.filter((row) => row.severity === "Critical");
  const marginAndSupplier =
    warningsInCategory(warnings, "Margin").length > 0 && warningsInCategory(warnings, "Supplier").length > 0;

  const bestSignals: string[] = [];
  if (warnings.length > 0) {
    bestSignals.push(`${warnings.length} active warning(s) resolved within the forecast horizon`);
  }
  if (health.scoredCategoryCount > 0) {
    bestSignals.push("Business health category scores stabilise or improve");
  }
  if (!bestSignals.length) bestSignals.push("Current stable signals maintained");

  const expectedSignals: string[] = [];
  if (health.trend !== "Insufficient Data") {
    expectedSignals.push(`Business health trend: ${health.trend}`);
  }
  if (health.overallStatus !== "Insufficient Data") {
    expectedSignals.push(`Overall health status: ${health.overallStatus}`);
  }
  if (warnings.length > 0) {
    expectedSignals.push(`${warnings.length} current warning(s) remain active`);
  }
  if (!expectedSignals.length) expectedSignals.push("Operational signals remain unchanged");

  const worstSignals: string[] = [];
  if (marginAndSupplier) {
    worstSignals.push("Supplier inflation and margin erosion continue together");
  }
  criticalWarnings.slice(0, 3).forEach((row) => worstSignals.push(row.title));
  if (!worstSignals.length && warnings.length > 0) {
    worstSignals.push(`${highestSeverityIn(warnings)} severity warnings compound without intervention`);
  }
  if (!worstSignals.length) worstSignals.push("No compounding risk signals on current data");

  return [
    {
      id: "scenario-best",
      title: "Best Case",
      summary:
        warnings.length > 0
          ? "Active warnings are resolved and data quality gaps are closed within the next 30 days."
          : "Current stable operational signals continue without new risk escalation.",
      signals: bestSignals,
    },
    {
      id: "scenario-expected",
      title: "Expected Case",
      summary:
        health.trend === "Declining"
          ? "Current declining business health trend continues if no corrective action is taken."
          : "Current operational trends continue unchanged over the next 30 days.",
      signals: expectedSignals,
    },
    {
      id: "scenario-worst",
      title: "Worst Case",
      summary: marginAndSupplier
        ? "Supplier inflation and margin erosion continue together, compounding cost pressure through the forecast horizon."
        : criticalWarnings.length > 0
          ? "Critical warnings compound and operational risk escalates without intervention."
          : "Existing medium and high warnings persist and widen their operational impact.",
      signals: worstSignals,
    },
  ];
}

function likelihoodFromWarnings(items: EarlyWarningItem[]): "Low" | "Medium" | "High" {
  if (!items.length) return "Low";
  const weight = items.reduce((sum, row) => sum + SEVERITY_WEIGHT[row.severity], 0);
  if (items.length >= 4 || weight >= 10) return "High";
  if (items.length >= 2 || weight >= 5) return "Medium";
  return "Low";
}

function impactFromWarnings(items: EarlyWarningItem[]): "Low" | "Medium" | "High" | "Critical" {
  const highest = highestSeverityIn(items);
  if (!highest) return "Low";
  return highest;
}

function buildHeatmap(warnings: EarlyWarningItem[]): HeatmapRisk[] {
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

  const results: HeatmapRisk[] = [];

  for (const category of categories) {
    const items = warningsInCategory(warnings, category);
    if (!items.length) continue;

    results.push({
      id: `heatmap-${category.toLowerCase().replace(/\s+/g, "-")}`,
      label: category,
      category,
      likelihood: likelihoodFromWarnings(items),
      impact: impactFromWarnings(items),
      href:
        category === "Margin"
          ? "/cost-intelligence"
          : category === "Supplier"
            ? "/suppliers"
            : category === "Inventory"
              ? "/inventory/stock"
              : category === "Procurement"
                ? "/purchase-orders"
                : category === "Manufacturing"
                  ? "/manufacturing"
                  : category === "Customer"
                    ? "/customer-invoices"
                    : category === "Xero"
                      ? "/integrations/xero"
                      : "/products",
    });
  }

  return results;
}

function buildTopFutureRisks(forecasts: ForecastedRisk[]): FutureRiskItem[] {
  return [...forecasts]
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
    .slice(0, 10)
    .map((row) => ({
      id: `future-${row.id}`,
      risk: row.risk,
      severity: row.severity,
      confidence: row.confidence,
      expectedImpact: row.forecastedOutcome,
      timeHorizon: row.forecastHorizon,
      recommendedResponse: row.recommendedAction,
      href: row.href,
    }));
}

function buildPreventiveActions(forecasts: ForecastedRisk[]): PreventiveAction[] {
  return [...forecasts]
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
    .slice(0, 10)
    .map((row, index) => ({
      id: `prevent-${row.id}`,
      priority: index + 1,
      title: row.recommendedAction,
      whyItMatters: row.currentStatus,
      expectedBenefit: `Reduces the likelihood that "${row.risk}" escalates within the ${FORECAST_HORIZON.toLowerCase()} horizon.`,
      href: row.href,
    }));
}

function computeConfidenceLevel(
  warningSnapshot: EarlyWarningSnapshot,
  healthSnapshot: BusinessHealthSnapshot
): ForecastConfidence {
  if (!warningSnapshot.hasMonitoringData) return "Low";

  const warnings = warningSnapshot.warnings;
  const highConfidenceCount = warnings.filter((row) => row.confidence === "High").length;
  const scoredCategories = healthSnapshot.scoredCategoryCount;

  if (scoredCategories >= 4 && (warnings.length === 0 || highConfidenceCount / warnings.length >= 0.6)) {
    return "High";
  }

  if (scoredCategories >= 2 || warningSnapshot.hasMonitoringData) return "Medium";
  return "Low";
}

function mergeForecasts(warningForecasts: ForecastedRisk[], modelForecasts: ForecastedRisk[]): ForecastedRisk[] {
  const seen = new Set<string>();
  const merged: ForecastedRisk[] = [];

  for (const row of [...warningForecasts, ...modelForecasts]) {
    const key = `${row.category}:${row.risk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  return merged.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
}

export function computePredictiveRiskSnapshot(input: PredictiveRiskInput): PredictiveRiskSnapshot {
  const warningSnapshot = computeEarlyWarningSnapshot(input);
  const healthSnapshot = computeBusinessHealthSnapshot(input);

  const warningForecasts = warningSnapshot.warnings.map(warningToForecast);
  const models = buildPredictiveModels(warningSnapshot.warnings, input);
  const modelForecasts = models.map(modelToForecast);
  const forecastedRisks = mergeForecasts(warningForecasts, modelForecasts);

  const exposure = warningSnapshot.summary.potentialExposure;

  return {
    summary: {
      criticalForecastRisks: forecastedRisks.filter((row) => row.severity === "Critical").length,
      highForecastRisks: forecastedRisks.filter((row) => row.severity === "High").length,
      forecastExposure: exposure,
      forecastExposureLabel: exposure != null ? warningSnapshot.summary.exposureLabel : "Exposure Not Yet Measurable",
      confidenceLevel: computeConfidenceLevel(warningSnapshot, healthSnapshot),
      forecastHorizon: FORECAST_HORIZON,
      outlookLabel: OUTLOOK_LABEL,
    },
    forecastedRisks,
    models,
    topFutureRisks: buildTopFutureRisks(forecastedRisks),
    scenarios: buildScenarios(warningSnapshot.warnings, healthSnapshot),
    heatmap: buildHeatmap(warningSnapshot.warnings),
    preventiveActions: buildPreventiveActions(forecastedRisks),
    hasForecastData: warningSnapshot.hasMonitoringData,
  };
}
