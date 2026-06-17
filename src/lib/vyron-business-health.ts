import type { ExecutiveCommandCentrePayload } from "@/lib/vyron-executive-command-centre";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import type { XeroConnectionState } from "@/lib/vyron-xero-integration";

export type HealthStatus = "Healthy" | "Watch" | "Risk" | "Critical" | "Insufficient Data";

export type TrendDirection = "Improving" | "Stable" | "Declining" | "Insufficient Data";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type HealthCategoryCard = {
  id: string;
  label: string;
  score: number | null;
  status: HealthStatus;
  keyIssue: string;
  href: string;
};

export type BusinessRiskItem = {
  id: string;
  title: string;
  level: RiskLevel;
  detail: string;
  href: string;
};

export type ExecutiveHealthAction = {
  id: string;
  title: string;
  severity: "critical" | "warning" | "info";
  explanation: string;
  href: string;
};

export type BusinessHealthSnapshot = {
  overallScore: number | null;
  overallStatus: HealthStatus;
  trend: TrendDirection;
  categories: HealthCategoryCard[];
  riskMatrix: Record<RiskLevel, BusinessRiskItem[]>;
  topRisks: BusinessRiskItem[];
  actions: ExecutiveHealthAction[];
  scoredCategoryCount: number;
};

export type BusinessHealthInput = {
  intelligence: TenantCostIntelligence | null;
  commandData: ExecutiveCommandCentrePayload | null;
  xeroConnection: XeroConnectionState | null;
  invoiceSummary: {
    monthlySales: number;
    monthlyGpPct: number;
    invoiceCount: number;
    uniqueCustomers: number;
  } | null;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusFromScore(score: number | null): HealthStatus {
  if (score == null || Number.isNaN(score)) return "Insufficient Data";
  if (score >= 80) return "Healthy";
  if (score >= 65) return "Watch";
  if (score >= 45) return "Risk";
  return "Critical";
}

function trendFromPoints(points: Array<{ value: number }>): TrendDirection | null {
  if (!points.length || points.every((point) => point.value === 0)) return null;
  const mid = Math.floor(points.length / 2);
  const first = points.slice(0, mid);
  const last = points.slice(mid);
  if (!first.length || !last.length) return null;
  const firstAvg = first.reduce((sum, point) => sum + point.value, 0) / first.length;
  const lastAvg = last.reduce((sum, point) => sum + point.value, 0) / last.length;
  const deltaPct = firstAvg === 0 ? (lastAvg > 0 ? 100 : 0) : ((lastAvg - firstAvg) / Math.abs(firstAvg)) * 100;
  if (Math.abs(deltaPct) < 5) return "Stable";
  return deltaPct > 0 ? "Improving" : "Declining";
}

function computeFinancialHealth(input: BusinessHealthInput): HealthCategoryCard {
  const { intelligence, xeroConnection, invoiceSummary } = input;
  const hasInvoices = Boolean(invoiceSummary && invoiceSummary.invoiceCount > 0);
  const hasXero = Boolean(xeroConnection);
  const hasRecovery = Boolean(intelligence && intelligence.summary.recoveryMonthly > 0);

  if (!hasInvoices && !hasXero && !hasRecovery) {
    return {
      id: "financial",
      label: "Financial Health",
      score: null,
      status: "Insufficient Data",
      keyIssue: "Post customer invoices or connect Xero to assess financial health.",
      href: "/customer-invoices",
    };
  }

  let score = 70;
  let keyIssue = "Financial position appears stable on available signals.";

  if (hasInvoices && invoiceSummary) {
    const gp = invoiceSummary.monthlyGpPct;
    if (gp >= 40) score += 20;
    else if (gp >= 35) score += 10;
    else if (gp >= 30) score -= 5;
    else {
      score -= 25;
      keyIssue = `Month GP at ${gp.toFixed(1)}% — below healthy threshold.`;
    }
    if (invoiceSummary.monthlySales <= 0) {
      score -= 10;
      keyIssue = "No recorded sales value on posted invoices this month.";
    }
  }

  if (hasXero) {
    if (xeroConnection?.connected) {
      score += 10;
      if (xeroConnection.connectionHealth === "healthy" || xeroConnection.status === "Connected") {
        score += 5;
      }
    } else {
      score -= 20;
      keyIssue = `Xero ${xeroConnection?.status || "not connected"} — accounting sync at risk.`;
    }
  }

  if (hasRecovery && intelligence) {
    const recovery = intelligence.summary.recoveryMonthly;
    if (recovery >= 50000) {
      score -= 15;
      if (keyIssue.includes("stable")) {
        keyIssue = `R${Math.round(recovery).toLocaleString("en-ZA")}/month recovery opportunity outstanding.`;
      }
    } else if (recovery >= 10000) {
      score -= 8;
    }
  }

  const finalScore = clampScore(score);
  return {
    id: "financial",
    label: "Financial Health",
    score: finalScore,
    status: statusFromScore(finalScore),
    keyIssue,
    href: "/executive-boardroom",
  };
}

function computeCostHealth(intelligence: TenantCostIntelligence | null): HealthCategoryCard {
  const products = intelligence?.products ?? [];
  if (!products.length) {
    return {
      id: "cost",
      label: "Cost Health",
      score: null,
      status: "Insufficient Data",
      keyIssue: "Add products with costs and target GP to measure cost health.",
      href: "/products",
    };
  }

  const erosionCount = intelligence?.summary.erosionCount ?? 0;
  const missingCost = products.filter((row) => !Number(row.total_cost)).length;
  const missingPrice = products.filter((row) => !Number(row.selling_price)).length;
  const bomMovement = intelligence?.bomCostMovement.length ?? 0;
  const inflationSuppliers = intelligence?.summary.inflationSuppliers ?? 0;

  const erosionRatio = erosionCount / products.length;
  let score = 100;
  score -= erosionRatio * 55;
  score -= (missingCost / products.length) * 25;
  score -= (missingPrice / products.length) * 15;
  score -= Math.min(20, bomMovement * 2);
  score -= Math.min(15, inflationSuppliers * 3);

  let keyIssue = "Cost structure stable across product master.";
  if (erosionCount > 0) {
    keyIssue = `${erosionCount} product(s) below target GP.`;
  } else if (missingCost > 0) {
    keyIssue = `${missingCost} product(s) missing total cost data.`;
  } else if (missingPrice > 0) {
    keyIssue = `${missingPrice} product(s) missing selling prices.`;
  } else if (bomMovement > 0) {
    keyIssue = `${bomMovement} ingredient(s) with BOM cost movement.`;
  } else if (inflationSuppliers > 0) {
    keyIssue = `${inflationSuppliers} supplier(s) with recorded inflation.`;
  }

  const finalScore = clampScore(score);
  return {
    id: "cost",
    label: "Cost Health",
    score: finalScore,
    status: statusFromScore(finalScore),
    keyIssue,
    href: "/cost-intelligence",
  };
}

function computeInventoryHealth(commandData: ExecutiveCommandCentrePayload | null): HealthCategoryCard {
  const inv = commandData?.inventory;
  const hasInventorySignal =
    inv &&
    (inv.inventoryValue > 0 ||
      inv.lowStock > 0 ||
      inv.overstock > 0 ||
      inv.slowMoving > 0 ||
      inv.negativeStockRisks > 0);

  if (!hasInventorySignal) {
    return {
      id: "inventory",
      label: "Inventory Health",
      score: null,
      status: "Insufficient Data",
      keyIssue: "Set up stock items and movements to assess inventory health.",
      href: "/inventory/stock",
    };
  }

  let score = 92;
  let keyIssue = "Inventory exposure within normal operating range.";

  if (inv!.lowStock > 0) {
    score -= Math.min(25, inv!.lowStock * 4);
    keyIssue = `${inv!.lowStock} low-stock alert(s) require attention.`;
  }
  if (inv!.overstock > 0) {
    score -= Math.min(20, inv!.overstock * 3);
    if (keyIssue.includes("normal")) keyIssue = `${inv!.overstock} overstock position(s) tie up working capital.`;
  }
  if (inv!.slowMoving > 0) {
    score -= Math.min(15, inv!.slowMoving * 2);
    if (keyIssue.includes("normal")) keyIssue = `${inv!.slowMoving} slow-moving SKU(s) detected.`;
  }
  if (inv!.negativeStockRisks > 0) {
    score -= Math.min(30, inv!.negativeStockRisks * 8);
    keyIssue = `${inv!.negativeStockRisks} negative stock risk(s) — resolve immediately.`;
  }

  const finalScore = clampScore(score);
  return {
    id: "inventory",
    label: "Inventory Health",
    score: finalScore,
    status: statusFromScore(finalScore),
    keyIssue,
    href: "/inventory/stock",
  };
}

function computeProcurementHealth(input: BusinessHealthInput): HealthCategoryCard {
  const { intelligence, commandData } = input;
  const procurement = commandData?.procurement;
  const inflationCount = intelligence?.summary.inflationSuppliers ?? 0;
  const hasProcurement =
    Boolean(procurement && (procurement.spendThisMonth > 0 || procurement.openPos > 0 || procurement.poVariances > 0)) ||
    inflationCount > 0;

  if (!hasProcurement) {
    return {
      id: "procurement",
      label: "Procurement Health",
      score: null,
      status: "Insufficient Data",
      keyIssue: "Import suppliers and process purchase orders / GRNs to assess procurement.",
      href: "/suppliers",
    };
  }

  let score = 88;
  let keyIssue = "Procurement activity stable on available data.";

  if (inflationCount > 0) {
    score -= Math.min(30, inflationCount * 5);
    keyIssue = `${inflationCount} supplier(s) with recorded price movement.`;
  }
  if (procurement && procurement.poVariances > 0) {
    score -= Math.min(20, procurement.poVariances * 4);
    if (keyIssue.includes("stable")) keyIssue = `${procurement.poVariances} PO variance(s) need review.`;
  }
  if (procurement && procurement.openPos >= 15) {
    score -= 8;
    if (keyIssue.includes("stable")) keyIssue = `${procurement.openPos} open purchase orders — monitor fulfilment.`;
  }

  const finalScore = clampScore(score);
  return {
    id: "procurement",
    label: "Procurement Health",
    score: finalScore,
    status: statusFromScore(finalScore),
    keyIssue,
    href: "/purchase-orders",
  };
}

function computeProductionHealth(commandData: ExecutiveCommandCentrePayload | null): HealthCategoryCard {
  const mfg = commandData?.manufacturing;
  const hasProduction =
    mfg &&
    (mfg.productionToday > 0 ||
      mfg.productionCost > 0 ||
      mfg.finishedGoodsProduced > 0 ||
      mfg.wastagePct > 0 ||
      mfg.yieldPct > 0);

  if (!hasProduction) {
    return {
      id: "production",
      label: "Production Health",
      score: null,
      status: "Insufficient Data",
      keyIssue: "Record manufacturing runs to assess production health.",
      href: "/manufacturing",
    };
  }

  let score = 85;
  let keyIssue = "Production performance within expected range.";

  if (mfg!.wastagePct >= 10) {
    score -= 30;
    keyIssue = `Wastage at ${mfg!.wastagePct.toFixed(1)}% — investigate variances.`;
  } else if (mfg!.wastagePct >= 5) {
    score -= 15;
    keyIssue = `Wastage at ${mfg!.wastagePct.toFixed(1)}% — monitor closely.`;
  }

  if (mfg!.yieldPct > 0 && mfg!.yieldPct < 85) {
    score -= 20;
    if (keyIssue.includes("expected")) keyIssue = `Yield at ${mfg!.yieldPct.toFixed(1)}% — below target.`;
  } else if (mfg!.yieldPct >= 95) {
    score += 5;
  }

  const finalScore = clampScore(score);
  return {
    id: "production",
    label: "Production Health",
    score: finalScore,
    status: statusFromScore(finalScore),
    keyIssue,
    href: "/manufacturing",
  };
}

function computeCustomerHealth(invoiceSummary: BusinessHealthInput["invoiceSummary"]): HealthCategoryCard {
  if (!invoiceSummary || invoiceSummary.invoiceCount <= 0) {
    return {
      id: "customer",
      label: "Customer Health",
      score: null,
      status: "Insufficient Data",
      keyIssue: "Post customer invoices to assess customer revenue health.",
      href: "/customer-invoices",
    };
  }

  let score = 78;
  let keyIssue = `${invoiceSummary.invoiceCount} invoice(s) posted this month.`;

  if (invoiceSummary.monthlyGpPct >= 40) score += 15;
  else if (invoiceSummary.monthlyGpPct >= 35) score += 5;
  else if (invoiceSummary.monthlyGpPct >= 30) score -= 10;
  else {
    score -= 25;
    keyIssue = `Month GP ${invoiceSummary.monthlyGpPct.toFixed(1)}% — customer profitability under pressure.`;
  }

  if (invoiceSummary.invoiceCount >= 3 && invoiceSummary.uniqueCustomers === 1) {
    score -= 15;
    keyIssue = "Customer concentration risk — single customer dominates month invoices.";
  }

  if (invoiceSummary.monthlySales <= 0) {
    score -= 20;
    keyIssue = "Posted invoices show no sales value this month.";
  }

  const finalScore = clampScore(score);
  return {
    id: "customer",
    label: "Customer Health",
    score: finalScore,
    status: statusFromScore(finalScore),
    keyIssue,
    href: "/customer-invoices",
  };
}

function buildRisks(input: BusinessHealthInput): BusinessRiskItem[] {
  const { intelligence, commandData, xeroConnection, invoiceSummary } = input;
  const risks: BusinessRiskItem[] = [];

  const erosion = intelligence?.summary.erosionCount ?? 0;
  if (erosion > 0) {
    risks.push({
      id: "low-margins",
      title: "Low margins",
      level: erosion >= 5 ? "Critical" : erosion >= 2 ? "High" : "Medium",
      detail: `${erosion} product(s) below target GP.`,
      href: "/cost-intelligence",
    });
  }

  const missingPrice = (intelligence?.products ?? []).filter((row) => !Number(row.selling_price)).length;
  if (missingPrice > 0) {
    risks.push({
      id: "missing-selling-prices",
      title: "Missing selling prices",
      level: missingPrice >= 5 ? "High" : "Medium",
      detail: `${missingPrice} product(s) without selling prices.`,
      href: "/products",
    });
  }

  const missingCost = (intelligence?.products ?? []).filter((row) => !Number(row.total_cost)).length;
  if (missingCost > 0) {
    risks.push({
      id: "missing-bom-costs",
      title: "Missing BOM costs",
      level: missingCost >= 5 ? "High" : "Medium",
      detail: `${missingCost} product(s) without total cost on record.`,
      href: "/recipes",
    });
  }

  const inflation = intelligence?.summary.inflationSuppliers ?? 0;
  if (inflation > 0) {
    risks.push({
      id: "supplier-inflation",
      title: "Supplier inflation",
      level: inflation >= 8 ? "Critical" : inflation >= 4 ? "High" : "Medium",
      detail: `${inflation} supplier(s) with recorded price movement.`,
      href: "/suppliers",
    });
  }

  const inv = commandData?.inventory;
  if (inv && (inv.lowStock > 0 || inv.overstock > 0 || inv.slowMoving > 0 || inv.negativeStockRisks > 0)) {
    risks.push({
      id: "inventory-exposure",
      title: "Inventory exposure",
      level:
        inv.negativeStockRisks > 0 || inv.lowStock >= 5
          ? "Critical"
          : inv.lowStock > 0 || inv.overstock >= 5
            ? "High"
            : "Medium",
      detail: `Low ${inv.lowStock} · Overstock ${inv.overstock} · Slow ${inv.slowMoving}.`,
      href: "/inventory/stock",
    });
  }

  if (xeroConnection && !xeroConnection.connected) {
    risks.push({
      id: "xero-disconnected",
      title: "Xero disconnected",
      level: "High",
      detail: `Accounting integration status: ${xeroConnection.status || "Not Connected"}.`,
      href: "/integrations/xero",
    });
  }

  const mfg = commandData?.manufacturing;
  if (mfg && mfg.wastagePct >= 5) {
    risks.push({
      id: "manufacturing-variance",
      title: "Manufacturing variance",
      level: mfg.wastagePct >= 10 ? "Critical" : "High",
      detail: `Wastage ${mfg.wastagePct.toFixed(1)}% · Yield ${mfg.yieldPct.toFixed(1)}%.`,
      href: "/manufacturing",
    });
  }

  if (invoiceSummary && invoiceSummary.invoiceCount >= 3 && invoiceSummary.uniqueCustomers === 1) {
    risks.push({
      id: "customer-concentration",
      title: "Customer concentration",
      level: "Medium",
      detail: "Single customer accounts for all posted invoices this month.",
      href: "/customers",
    });
  }

  if (invoiceSummary && invoiceSummary.monthlyGpPct > 0 && invoiceSummary.monthlyGpPct < 30) {
    risks.push({
      id: "margin-erosion-invoices",
      title: "Margin erosion",
      level: invoiceSummary.monthlyGpPct < 25 ? "Critical" : "High",
      detail: `Realised month GP ${invoiceSummary.monthlyGpPct.toFixed(1)}% on posted invoices.`,
      href: "/reports/product-margins",
    });
  }

  const bomMovement = intelligence?.bomCostMovement.length ?? 0;
  if (bomMovement > 0) {
    risks.push({
      id: "bom-movement",
      title: "BOM cost movement",
      level: bomMovement >= 6 ? "High" : "Low",
      detail: `${bomMovement} ingredient(s) with cost movement affecting recipes.`,
      href: "/recipes",
    });
  }

  return risks;
}

function riskLevelWeight(level: RiskLevel) {
  if (level === "Critical") return 4;
  if (level === "High") return 3;
  if (level === "Medium") return 2;
  return 1;
}

function buildActions(input: BusinessHealthInput, categories: HealthCategoryCard[]): ExecutiveHealthAction[] {
  const { intelligence, xeroConnection, invoiceSummary } = input;
  const actions: ExecutiveHealthAction[] = [];

  const erosion = intelligence?.summary.erosionCount ?? 0;
  if (erosion > 0) {
    actions.push({
      id: "review-below-gp",
      title: "Review products below GP target",
      severity: erosion >= 5 ? "critical" : "warning",
      explanation: `${erosion} product(s) are below target gross profit.`,
      href: "/reports/product-margins",
    });
  }

  const missingPrice = (intelligence?.products ?? []).filter((row) => !Number(row.selling_price)).length;
  if (missingPrice > 0) {
    actions.push({
      id: "complete-selling-prices",
      title: "Complete missing selling prices",
      severity: "warning",
      explanation: `${missingPrice} product(s) need selling prices for margin control.`,
      href: "/products",
    });
  }

  const inflation = intelligence?.summary.inflationSuppliers ?? 0;
  if (inflation > 0) {
    actions.push({
      id: "review-supplier-increases",
      title: "Review supplier increases",
      severity: inflation >= 5 ? "critical" : "warning",
      explanation: `${inflation} supplier(s) show recorded price movement.`,
      href: "/document-intelligence/price-history/supplier",
    });
  }

  const invCategory = categories.find((row) => row.id === "inventory");
  if (invCategory && invCategory.status !== "Healthy" && invCategory.status !== "Insufficient Data") {
    actions.push({
      id: "review-inventory",
      title: "Review inventory adjustments",
      severity: invCategory.status === "Critical" ? "critical" : "warning",
      explanation: invCategory.keyIssue,
      href: "/inventory/stock",
    });
  }

  if (xeroConnection && !xeroConnection.connected) {
    actions.push({
      id: "resolve-xero",
      title: "Resolve disconnected Xero tenant",
      severity: "warning",
      explanation: "Connect Xero before posting accounting-ready transactions.",
      href: "/integrations/xero",
    });
  }

  const missingCost = (intelligence?.products ?? []).filter((row) => !Number(row.total_cost)).length;
  if (missingCost > 0) {
    actions.push({
      id: "complete-bom-costs",
      title: "Complete missing BOM cost data",
      severity: "info",
      explanation: `${missingCost} product(s) lack total cost for accurate margin analysis.`,
      href: "/recipes",
    });
  }

  if (invoiceSummary && invoiceSummary.invoiceCount === 0) {
    actions.push({
      id: "post-invoices",
      title: "Post customer invoices",
      severity: "info",
      explanation: "No posted invoices this month — financial and customer health need invoice activity.",
      href: "/customer-invoices",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "continue-monitoring",
      title: "Continue executive monitoring",
      severity: "info",
      explanation: "No urgent actions on current data — review boardroom and cost intelligence regularly.",
      href: "/executive-boardroom",
    });
  }

  return actions.slice(0, 8);
}

export function computeBusinessHealthSnapshot(input: BusinessHealthInput): BusinessHealthSnapshot {
  const categories = [
    computeFinancialHealth(input),
    computeCostHealth(input.intelligence),
    computeInventoryHealth(input.commandData),
    computeProcurementHealth(input),
    computeProductionHealth(input.commandData),
    computeCustomerHealth(input.invoiceSummary),
  ];

  const scored = categories.filter((row) => row.score != null);
  const overallScore =
    scored.length > 0
      ? clampScore(scored.reduce((sum, row) => sum + (row.score as number), 0) / scored.length)
      : null;

  const risks = buildRisks(input);
  const riskMatrix: Record<RiskLevel, BusinessRiskItem[]> = {
    Low: risks.filter((row) => row.level === "Low"),
    Medium: risks.filter((row) => row.level === "Medium"),
    High: risks.filter((row) => row.level === "High"),
    Critical: risks.filter((row) => row.level === "Critical"),
  };

  const topRisks = [...risks]
    .sort((a, b) => riskLevelWeight(b.level) - riskLevelWeight(a.level))
    .slice(0, 10);

  let trend: TrendDirection = "Insufficient Data";
  const recoveryTrend = input.commandData?.trends.recoveryTrend;
  const spendTrend = input.commandData?.trends.spendTrend;
  const recoveryDirection = recoveryTrend ? trendFromPoints(recoveryTrend) : null;
  const spendDirection = spendTrend ? trendFromPoints(spendTrend) : null;

  if (recoveryDirection && spendDirection) {
    if (recoveryDirection === "Improving" && spendDirection !== "Declining") trend = "Improving";
    else if (recoveryDirection === "Declining" || spendDirection === "Declining") trend = "Declining";
    else trend = "Stable";
  } else if (recoveryDirection) {
    trend = recoveryDirection;
  } else if (spendDirection) {
    trend = spendDirection;
  } else if (scored.length >= 2) {
    const weakCategories = categories.filter(
      (row) => row.status === "Critical" || row.status === "Risk"
    ).length;
    const healthyCategories = categories.filter((row) => row.status === "Healthy").length;
    if (weakCategories >= 3) trend = "Declining";
    else if (healthyCategories >= 3) trend = "Stable";
  }

  return {
    overallScore,
    overallStatus: statusFromScore(overallScore),
    trend,
    categories,
    riskMatrix,
    topRisks,
    actions: buildActions(input, categories),
    scoredCategoryCount: scored.length,
  };
}
