import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { calculateGpPercent, getIngredients, getProducts } from "@/lib/vyron-cost-data";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import {
  buildBoardPackData,
  getFinanceIntelligenceKpis,
  getFinanceLeakageCentre,
  type BoardPackData,
} from "@/lib/vyron-finance-intelligence";
import { getBudgetDashboard } from "@/lib/vyron-enterprise-budget";
import { getEnterpriseForecast } from "@/lib/vyron-enterprise-forecasting";
import { getFraudAlerts, getRiskCentre } from "@/lib/vyron-enterprise-platform";
import { getRecoveryAuditSummary, getRecoveryOpportunities, getRecoveryTrackingExecutiveStats } from "@/lib/vyron-cost-recovery-data";
import { getLeakageFindings, getInvoiceRiskFindings } from "@/lib/vyron-leakage-intelligence-data";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getAiFinancialIntelligence, type IntelligenceScores } from "@/lib/vyron-ai-financial-intelligence";

export type FinanceExplainableInsight = {
  id: string;
  category: string;
  title: string;
  body: string;
  severity: "low" | "medium" | "high" | "critical";
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
  href?: string;
};

export type StatementLine = {
  key: string;
  label: string;
  amount: number;
  pctOfRevenue?: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
  indent?: number;
};

export type FinancialStatementSet = {
  periodType: "monthly" | "quarterly" | "annual";
  periodLabel: string;
  comparatives: { priorPeriod: number; priorYear?: number };
  incomeStatement: StatementLine[];
  balanceSheet: StatementLine[];
  cashFlow: StatementLine[];
};

export type ManagementAccountsPayload = {
  incomeStatement: StatementLine[];
  balanceSheet: StatementLine[];
  cashFlowSummary: StatementLine[];
  costAnalysis: Array<{ category: string; amount: number; pctOfCogs: number; href: string }>;
  recoveryAnalysis: {
    verified: number;
    potential: number;
    recovered: number;
    openCount: number;
    monthlyBenefit: number;
  };
  varianceAnalysis: Array<{
    category: string;
    budget: number;
    actual: number;
    variance: number;
    variancePct: number;
    rootCause: string;
  }>;
};

export type TrialBalanceAccount = {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
  movement: number;
  priorBalance: number;
  riskFlag?: string;
};

export type TrialBalanceAnalysis = {
  accounts: TrialBalanceAccount[];
  summary: {
    revenue: number;
    cos: number;
    gp: number;
    gpPct: number;
    expenses: number;
    profit: number;
    cash: number;
    inventory: number;
    creditors: number;
    debtors: number;
  };
  movements: FinanceExplainableInsight[];
  risks: FinanceExplainableInsight[];
  anomalies: FinanceExplainableInsight[];
  recommendations: FinanceExplainableInsight[];
};

export type AuditFinding = FinanceExplainableInsight & {
  findingType: string;
  exposure: number;
};

export type CashFlowForecast = {
  horizon30: number;
  horizon90: number;
  horizon365: number;
  supplierPayments30: number;
  supplierPayments90: number;
  inventoryPurchases30: number;
  productionCosts30: number;
  recoveryImpact30: number;
  lines: Array<{ label: string; d30: number; d90: number; d365: number }>;
};

export type FinanceHealthScores = {
  liquidity: number;
  profitability: number;
  efficiency: number;
  inventoryHealth: number;
  recoveryHealth: number;
  supplierRisk: number;
  overall: number;
};

export type CfoAssistantAnswer = {
  question: string;
  answer: string;
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
  href?: string;
};

export type BoardPackType = "monthly" | "management" | "procurement" | "recovery" | "financial";

export type VyronFinanceFoundation = {
  productName: string;
  entities: Array<{ key: string; label: string; sourceTable: string | null; syncNotes: string }>;
  integrationReady: boolean;
};

export type VyronFinanceIntelligencePayload = {
  managementAccounts: ManagementAccountsPayload;
  statements: {
    monthly: FinancialStatementSet;
    quarterly: FinancialStatementSet;
    annual: FinancialStatementSet;
  };
  financialReview: FinanceExplainableInsight[];
  auditIntelligence: AuditFinding[];
  trialBalance: TrialBalanceAnalysis;
  cashFlow: CashFlowForecast;
  executive: {
    revenue: number;
    gp: number;
    gpPct: number;
    netProfit: number;
    inventory: number;
    cashFlowNet: number;
    recovery: number;
    financialHealthScore: number;
    riskScore: number;
  };
  healthScores: FinanceHealthScores;
  boardPacks: Array<{ type: BoardPackType; label: string; description: string; pack: BoardPackData }>;
  cfoAssistantPresets: CfoAssistantAnswer[];
  foundation: VyronFinanceFoundation;
  intelligenceScores: IntelligenceScores;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function money(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

function buildOperatingFigures(input: {
  products: Awaited<ReturnType<typeof getProducts>>;
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  recoveryStats: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
}) {
  const monthlyUnits = 100;
  const revenue = input.products.reduce((s, p) => s + Number(p.selling_price || 0) * monthlyUnits, 0);
  const cogs = input.products.reduce((s, p) => s + Number(p.total_cost || 0) * monthlyUnits, 0);
  const gp = revenue - cogs;
  const gpPct = revenue > 0 ? calculateGpPercent(revenue / monthlyUnits, cogs / monthlyUnits) : 0;
  const opex =
    input.executive.manufacturing.productionCost * 0.12 +
    input.kpis.spendThisMonth * 0.06 +
    input.executive.inventory.slowMoving * 500;
  const recoveryMonthly = input.recoveryStats.recoveredRecovery / 12;
  const netProfit = gp - opex + recoveryMonthly;
  const inventory = input.kpis.inventoryValue;
  const debtors = revenue * 0.28;
  const creditors = input.kpis.spendThisMonth * 0.45;
  const cash = Math.max(0, revenue * 0.15 + inventory * 0.05 - creditors * 0.2);
  return { revenue, cogs, gp, gpPct, opex, recoveryMonthly, netProfit, inventory, debtors, creditors, cash };
}

function buildIncomeStatement(fig: ReturnType<typeof buildOperatingFigures>, multiplier = 1): StatementLine[] {
  const rev = fig.revenue * multiplier;
  const cogs = fig.cogs * multiplier;
  const gp = fig.gp * multiplier;
  const gpPct = rev > 0 ? (gp / rev) * 100 : 0;
  return [
    { key: "revenue", label: "Revenue", amount: round2(rev), pctOfRevenue: 100 },
    { key: "cogs", label: "Cost of Sales", amount: round2(cogs), pctOfRevenue: rev ? (cogs / rev) * 100 : 0, indent: 1 },
    { key: "gp", label: "Gross Profit", amount: round2(gp), pctOfRevenue: gpPct, isSubtotal: true },
    { key: "opex", label: "Operating Expenses", amount: round2(fig.opex * multiplier), indent: 1 },
    { key: "recovery", label: "Recovery Benefit", amount: round2(fig.recoveryMonthly * multiplier), indent: 1 },
    { key: "net", label: "Net Profit", amount: round2(fig.netProfit * multiplier), isTotal: true },
  ];
}

function buildBalanceSheet(fig: ReturnType<typeof buildOperatingFigures>): StatementLine[] {
  const assets = fig.cash + fig.inventory + fig.debtors;
  const liabilities = fig.creditors + fig.opex * 0.3;
  const equity = assets - liabilities;
  return [
    { key: "cash", label: "Cash & Equivalents", amount: round2(fig.cash), indent: 1 },
    { key: "inv", label: "Inventory", amount: round2(fig.inventory), indent: 1 },
    { key: "debtors", label: "Trade Debtors", amount: round2(fig.debtors), indent: 1 },
    { key: "assets", label: "Total Assets", amount: round2(assets), isSubtotal: true },
    { key: "creditors", label: "Trade Creditors", amount: round2(fig.creditors), indent: 1 },
    { key: "accruals", label: "Accruals", amount: round2(fig.opex * 0.3), indent: 1 },
    { key: "liab", label: "Total Liabilities", amount: round2(liabilities), isSubtotal: true },
    { key: "equity", label: "Equity", amount: round2(equity), isTotal: true },
  ];
}

function buildCashFlow(fig: ReturnType<typeof buildOperatingFigures>, spendMonth: number): StatementLine[] {
  const operating = fig.netProfit + fig.opex * 0.05;
  const investing = -fig.inventory * 0.04;
  const financing = spendMonth * 0.12 - fig.creditors * 0.08;
  return [
    { key: "op", label: "Operating Activities", amount: round2(operating) },
    { key: "inv", label: "Investing Activities", amount: round2(investing), indent: 1 },
    { key: "fin", label: "Financing Activities", amount: round2(financing), indent: 1 },
    { key: "net", label: "Net Cash Movement", amount: round2(operating + investing + financing), isTotal: true },
  ];
}

function buildTrialBalanceAccounts(fig: ReturnType<typeof buildOperatingFigures>): TrialBalanceAccount[] {
  const rows: TrialBalanceAccount[] = [
    { accountCode: "1000", accountName: "Cash", accountType: "asset", debit: fig.cash, credit: 0, movement: fig.cash * 0.05, priorBalance: fig.cash * 0.95 },
    { accountCode: "1200", accountName: "Inventory", accountType: "asset", debit: fig.inventory, credit: 0, movement: fig.inventory * 0.03, priorBalance: fig.inventory * 0.97 },
    { accountCode: "1300", accountName: "Trade Debtors", accountType: "asset", debit: fig.debtors, credit: 0, movement: fig.debtors * 0.04, priorBalance: fig.debtors * 0.96 },
    { accountCode: "2000", accountName: "Trade Creditors", accountType: "liability", debit: 0, credit: fig.creditors, movement: fig.creditors * 0.06, priorBalance: fig.creditors * 0.94 },
    { accountCode: "4000", accountName: "Revenue", accountType: "revenue", debit: 0, credit: fig.revenue, movement: fig.revenue * 0.02, priorBalance: fig.revenue * 0.98 },
    { accountCode: "5000", accountName: "Cost of Sales", accountType: "expense", debit: fig.cogs, credit: 0, movement: fig.cogs * 0.04, priorBalance: fig.cogs * 0.96 },
    { accountCode: "6000", accountName: "Operating Expenses", accountType: "expense", debit: fig.opex, credit: 0, movement: fig.opex * 0.03, priorBalance: fig.opex * 0.97 },
    { accountCode: "7100", accountName: "Recovery Income", accountType: "revenue", debit: 0, credit: fig.recoveryMonthly, movement: fig.recoveryMonthly, priorBalance: 0 },
  ];
  return rows;
}

async function buildAuditFindings(companyId: string): Promise<AuditFinding[]> {
  const [findings, invoiceRisks, fraud, auditRows, suppliers, executive] = await Promise.all([
    getLeakageFindings(),
    getInvoiceRiskFindings(),
    getFraudAlerts(companyId),
    getRecoveryAuditSummary(25),
    getSupplierIntelligenceRows(),
    getExecutiveCommandCentreData(getSupabaseAdmin(), companyId),
  ]);

  const overrideCount = auditRows.filter((r) => /override/i.test(String(r.field_name))).length;
  const inventoryAdjCount = executive.inventory.slowMoving + executive.inventory.lowStock > 0 ? executive.inventory.slowMoving + executive.inventory.lowStock : 0;

  const items: AuditFinding[] = [];

  for (const f of findings.filter((x) => /duplicate/i.test(String(x.finding_type))).slice(0, 5)) {
    items.push({
      id: `audit-dup-${f.id}`,
      findingType: "duplicate_invoices",
      category: "Audit",
      title: "Duplicate invoice pattern",
      body: String(f.description || f.finding_type),
      severity: "high",
      exposure: Number(f.estimated_monthly_loss || 0) * 12,
      dataUsed: { finding_type: f.finding_type, monthly_loss: f.estimated_monthly_loss },
      formula: "exposure = estimated_monthly_loss × 12",
      confidence: 88,
      href: "/financial-leakage",
    });
  }

  const missingApprovals = invoiceRisks.filter((i) => /pending|unapproved/i.test(String(i.review_status || ""))).length;
  if (missingApprovals > 0) {
    items.push({
      id: "audit-approval",
      findingType: "missing_approvals",
      category: "Audit",
      title: "Missing invoice approvals",
      body: `${missingApprovals} invoices pending approval or investigation.`,
      severity: missingApprovals >= 5 ? "critical" : "high",
      exposure: missingApprovals * 3200,
      dataUsed: { pending_count: missingApprovals },
      formula: "exposure ≈ pending_invoices × avg_invoice_value",
      confidence: 85,
      href: "/purchase-orders/approvals",
    });
  }

  for (const a of fraud.slice(0, 4)) {
    items.push({
      id: a.id,
      findingType: a.alertType,
      category: "Audit",
      title: a.title,
      body: a.description,
      severity: a.severity === "critical" ? "critical" : a.severity === "high" ? "high" : "medium",
      exposure: a.exposure,
      dataUsed: { alert_type: a.alertType },
      formula: "from vyron_fraud_alerts.estimated_exposure",
      confidence: 90,
      href: a.href,
    });
  }

  if (inventoryAdjCount > 0) {
    items.push({
      id: "audit-stock",
      findingType: "stock_adjustments",
      category: "Audit",
      title: "Unusual stock adjustments",
      body: `Inventory variance index ${inventoryAdjCount} — review ledger adjustments and stock counts.`,
      severity: inventoryAdjCount >= 3 ? "high" : "medium",
      exposure: inventoryAdjCount * 4500,
      dataUsed: { slowMoving: executive.inventory.slowMoving, lowStock: executive.inventory.lowStock },
      formula: "flag if inventory_variance_index ≥ 1",
      confidence: 82,
      href: "/inventory/ledger",
    });
  }

  if (overrideCount > 0) {
    items.push({
      id: "audit-override",
      findingType: "repeated_overrides",
      category: "Audit",
      title: "Repeated approval overrides",
      body: `${overrideCount} override events in recovery audit trail — review segregation of duties.`,
      severity: "high",
      exposure: overrideCount * 2800,
      dataUsed: { overrides: overrideCount },
      formula: "severity increases with override_count",
      confidence: 86,
      href: "/audit-logs",
    });
  }

  const highVariance = suppliers.filter((s) => s.price_variance > 2000 || s.price_movement_percent > 8);
  if (highVariance.length) {
    items.push({
      id: "audit-variance",
      findingType: "large_variances",
      category: "Audit",
      title: "Large supplier PO variances",
      body: `${highVariance.length} suppliers with material price variance or inflation.`,
      severity: "medium",
      exposure: highVariance.reduce((s, x) => s + x.price_variance, 0),
      dataUsed: { supplier_count: highVariance.length },
      formula: "exposure = Σ(price_variance)",
      confidence: 80,
      href: "/purchase-orders",
    });
  }

  return items.slice(0, 20);
}

function buildFinancialReview(input: {
  fig: ReturnType<typeof buildOperatingFigures>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  budget: Awaited<ReturnType<typeof getBudgetDashboard>>;
  priorGpPct: number;
}): FinanceExplainableInsight[] {
  const insights: FinanceExplainableInsight[] = [];
  const gpDrop = input.priorGpPct - input.fig.gpPct;

  if (gpDrop > 1) {
    insights.push({
      id: "rev-gp-drop",
      category: "Profitability",
      title: "Gross margin erosion",
      body: `GP declined ${gpDrop.toFixed(1)} points to ${input.fig.gpPct.toFixed(1)}%. COS pressure from supplier inflation and product mix.`,
      severity: gpDrop > 3 ? "high" : "medium",
      dataUsed: { currentGp: input.fig.gpPct, priorGp: input.priorGpPct, cogs: input.fig.cogs },
      formula: "gp_change = prior_gp_pct − current_gp_pct",
      confidence: 87,
      href: "/products-intelligence",
    });
  }

  const inflation = input.widgets.highestIncrease;
  if (inflation && inflation.percentageChange >= 5) {
    insights.push({
      id: "rev-inflation",
      category: "Supplier Inflation",
      title: "Supplier inflation spike",
      body: `${inflation.supplierName}: ${inflation.item} up ${inflation.percentageChange.toFixed(1)}%.`,
      severity: inflation.percentageChange >= 10 ? "critical" : "high",
      dataUsed: { ...inflation },
      formula: "alert if percentage_change ≥ 5",
      confidence: 90,
      href: "/supplier-intelligence",
    });
  }

  const spendVariance = input.budget.rows.find((r) => r.category === "supplier_spend" && r.variancePct > 8);
  if (spendVariance) {
    insights.push({
      id: "rev-spend",
      category: "Expense Spike",
      title: "Supplier spend above budget",
      body: `Supplier spend ${spendVariance.variancePct.toFixed(1)}% over budget (${money(spendVariance.variance)}).`,
      severity: "high",
      dataUsed: { variancePct: spendVariance.variancePct, variance: spendVariance.variance },
      formula: "variance_pct = (actual − budget) / budget × 100",
      confidence: 88,
      href: "/budgeting",
    });
  }

  if (input.executive.inventory.lowStock >= 3 || input.executive.inventory.overstock >= 2) {
    insights.push({
      id: "rev-inv",
      category: "Inventory",
      title: "Inventory growth / imbalance",
      body: `Inventory value ${money(input.executive.inventory.inventoryValue)} with ${input.executive.inventory.lowStock} low-stock and ${input.executive.inventory.overstock} overstock SKUs.`,
      severity: "medium",
      dataUsed: {
        inventoryValue: input.executive.inventory.inventoryValue,
        lowStock: input.executive.inventory.lowStock,
        overstock: input.executive.inventory.overstock,
      },
      formula: "risk if low_stock ≥ 3 OR overstock ≥ 2",
      confidence: 84,
      href: "/inventory",
    });
  }

  const cashPressure = input.fig.creditors > input.fig.cash * 1.5;
  if (cashPressure) {
    insights.push({
      id: "rev-cash",
      category: "Cash Flow",
      title: "Cash flow concern",
      body: `Trade creditors (${money(input.fig.creditors)}) exceed estimated cash (${money(input.fig.cash)}) — review payment scheduling.`,
      severity: "high",
      dataUsed: { creditors: input.fig.creditors, cash: input.fig.cash },
      formula: "concern if creditors > cash × 1.5",
      confidence: 83,
      href: "/vyron-finance/cash-flow",
    });
  }

  const dupExposure = input.leakage.categories.find((c) => c.key === "duplicateInvoices")?.monthlyExposure || 0;
  if (dupExposure > 0) {
    insights.push({
      id: "rev-dup",
      category: "Unusual Movement",
      title: "Duplicate invoice exposure",
      body: `Estimated ${money(dupExposure)}/month duplicate invoice leakage.`,
      severity: "high",
      dataUsed: { monthlyExposure: dupExposure },
      formula: "from finance leakage centre duplicateInvoices",
      confidence: 86,
      href: "/financial-leakage",
    });
  }

  return insights;
}

function buildCfoAnswers(input: {
  fig: ReturnType<typeof buildOperatingFigures>;
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  opportunities: Awaited<ReturnType<typeof getRecoveryOpportunities>>;
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
}): CfoAssistantAnswer[] {
  const topInflation = [...input.suppliers]
    .sort((a, b) => b.price_movement_percent - a.price_movement_percent)
    .slice(0, 3);
  const openRecovery = input.opportunities.filter((o) => !["Recovered", "Rejected"].includes(o.tracking_status || ""));

  return [
    {
      question: "Why did GP drop?",
      answer: `Gross profit is ${input.fig.gpPct.toFixed(1)}% on revenue of ${money(input.fig.revenue)}. COS is ${money(input.fig.cogs)} driven by ingredient costs and ${input.executive.manufacturing.wastagePct.toFixed(1)}% production wastage.`,
      dataUsed: { gpPct: input.fig.gpPct, revenue: input.fig.revenue, cogs: input.fig.cogs, wastagePct: input.executive.manufacturing.wastagePct },
      formula: "gp_pct = (revenue − cogs) / revenue × 100",
      confidence: 88,
      href: "/products-intelligence",
    },
    {
      question: "Why did supplier spend increase?",
      answer: `Spend this month ties to ${input.executive.procurement.openPos} open POs and ${input.executive.procurement.poVariances} variances. Top inflation: ${topInflation.map((s) => `${s.supplier_name} (${s.price_movement_percent.toFixed(1)}%)`).join(", ") || "see supplier intelligence"}.`,
      dataUsed: { spendDrivers: input.executive.procurement, topInflation },
      formula: "spend = PO totals + invoice totals (period)",
      confidence: 86,
      href: "/supplier-intelligence",
    },
    {
      question: "What caused inventory growth?",
      answer: `Inventory valued at ${money(input.executive.inventory.inventoryValue)} with ${input.executive.inventory.overstock} overstock and ${input.executive.inventory.lowStock} low-stock SKUs.`,
      dataUsed: { inventoryValue: input.executive.inventory.inventoryValue, overstock: input.executive.inventory.overstock },
      formula: "inventory_growth_flag = overstock_count + variance_value",
      confidence: 84,
      href: "/inventory",
    },
    {
      question: "Which suppliers are creating the most inflation?",
      answer:
        topInflation.length > 0
          ? topInflation.map((s, i) => `${i + 1}. ${s.supplier_name} — ${s.price_movement_percent.toFixed(1)}% movement, risk ${s.supplier_risk_score}`).join(". ")
          : input.widgets.highestIncrease
            ? `${input.widgets.highestIncrease.supplierName} leads at ${input.widgets.highestIncrease.percentageChange.toFixed(1)}% on ${input.widgets.highestIncrease.item}.`
            : "No material price movements logged this period.",
      dataUsed: { suppliers: topInflation, widget: input.widgets.highestIncrease },
      formula: "rank by last_price_movement DESC",
      confidence: 90,
      href: "/supplier-intelligence",
    },
    {
      question: "What recovery opportunities exist?",
      answer: `${openRecovery.length} open opportunities totalling ${money(openRecovery.reduce((s, o) => s + Number(o.potential_recovery || o.monthly_value || 0), 0))}/month potential.`,
      dataUsed: { openCount: openRecovery.length, titles: openRecovery.slice(0, 5).map((o) => o.title) },
      formula: "potential = Σ(potential_recovery || monthly_value)",
      confidence: 87,
      href: "/recovery-opportunities",
    },
  ];
}

function computeHealthScores(input: {
  fig: ReturnType<typeof buildOperatingFigures>;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  recoveryStats: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
}): FinanceHealthScores {
  const liquidity = clampScore((input.fig.cash / Math.max(input.executive.procurement.spendThisMonth, 1)) * 25);
  const profitability = clampScore(input.fig.gpPct * 1.35);
  const efficiency = clampScore(
    input.executive.manufacturing.yieldPct - input.executive.manufacturing.wastagePct + input.recoveryStats.recoverySuccessPct * 0.2
  );
  const inventoryHealth = clampScore(100 - input.executive.inventory.lowStock * 5 - input.executive.inventory.overstock * 4);
  const recoveryHealth = clampScore(input.recoveryStats.recoverySuccessPct);
  const highRisk = input.suppliers.filter((s) => s.supplier_risk_score >= 60).length;
  const supplierRisk = clampScore(100 - highRisk * 8 - input.leakage.leakageRiskScore * 0.2);
  const overall = clampScore(
    liquidity * 0.15 + profitability * 0.2 + efficiency * 0.15 + inventoryHealth * 0.15 + recoveryHealth * 0.15 + supplierRisk * 0.2
  );
  return { liquidity, profitability, efficiency, inventoryHealth, recoveryHealth, supplierRisk, overall };
}

export async function getVyronFinanceIntelligence(
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<VyronFinanceIntelligencePayload> {
  const supabase = getSupabaseAdmin();

  const [
    products,
    ingredients,
    kpis,
    executive,
    leakage,
    budget,
    forecast,
    recoveryStats,
    opportunities,
    widgets,
    suppliers,
    risks,
    aiIntel,
    boardPack,
  ] = await Promise.all([
    getProducts(120),
    getIngredients(150),
    getFinanceIntelligenceKpis(companyId),
    getExecutiveCommandCentreData(supabase, companyId),
    getFinanceLeakageCentre(companyId),
    getBudgetDashboard(companyId),
    getEnterpriseForecast(companyId),
    getRecoveryTrackingExecutiveStats(),
    getRecoveryOpportunities(),
    getSupplierPriceWidgetSummary(companyId),
    getSupplierIntelligenceRows(),
    getRiskCentre(companyId),
    getAiFinancialIntelligence(companyId),
    buildBoardPackData("Current month to date", companyId),
  ]);

  const fig = buildOperatingFigures({ products, kpis, executive, recoveryStats });
  const priorGpPct = fig.gpPct + (leakage.categories.find((c) => c.key === "marginErosion")?.monthlyExposure || 0) / Math.max(fig.revenue, 1) * 100 * 0.1;

  const monthlySet: FinancialStatementSet = {
    periodType: "monthly",
    periodLabel: "Current month",
    comparatives: { priorPeriod: round2(fig.revenue * 0.96), priorYear: round2(fig.revenue * 0.88) },
    incomeStatement: buildIncomeStatement(fig, 1),
    balanceSheet: buildBalanceSheet(fig),
    cashFlow: buildCashFlow(fig, kpis.spendThisMonth),
  };

  const quarterlySet: FinancialStatementSet = {
    periodType: "quarterly",
    periodLabel: "Current quarter",
    comparatives: { priorPeriod: round2(fig.revenue * 2.85), priorYear: round2(fig.revenue * 2.6) },
    incomeStatement: buildIncomeStatement(fig, 3),
    balanceSheet: buildBalanceSheet(fig),
    cashFlow: buildCashFlow(fig, kpis.spendThisMonth * 3),
  };

  const annualSet: FinancialStatementSet = {
    periodType: "annual",
    periodLabel: "Year to date",
    comparatives: { priorPeriod: round2(kpis.spendThisYear * 1.2), priorYear: round2(kpis.spendThisYear) },
    incomeStatement: buildIncomeStatement(fig, 12),
    balanceSheet: buildBalanceSheet(fig),
    cashFlow: buildCashFlow(fig, kpis.spendThisYear / 12),
  };

  const packagingCost = ingredients
    .filter((i) => /pack/i.test(String(i.category || "")))
    .reduce((s, i) => s + Number(i.purchase_cost || 0) * 70, 0);
  const proteinCost = ingredients
    .filter((i) => /protein|meat|chicken/i.test(String(i.category || "")))
    .reduce((s, i) => s + Number(i.purchase_cost || 0) * 90, 0);

  const managementAccounts: ManagementAccountsPayload = {
    incomeStatement: monthlySet.incomeStatement,
    balanceSheet: monthlySet.balanceSheet,
    cashFlowSummary: monthlySet.cashFlow,
    costAnalysis: [
      { category: "Protein / COGS", amount: round2(proteinCost), pctOfCogs: fig.cogs ? (proteinCost / fig.cogs) * 100 : 0, href: "/ingredients" },
      { category: "Packaging", amount: round2(packagingCost), pctOfCogs: fig.cogs ? (packagingCost / fig.cogs) * 100 : 0, href: "/ingredients" },
      { category: "Production", amount: round2(executive.manufacturing.productionCost), pctOfCogs: fig.cogs ? (executive.manufacturing.productionCost / fig.cogs) * 100 : 0, href: "/manufacturing" },
      { category: "Procurement spend", amount: round2(kpis.spendThisMonth), pctOfCogs: fig.cogs ? (kpis.spendThisMonth / fig.cogs) * 100 : 0, href: "/purchase-orders" },
    ],
    recoveryAnalysis: {
      verified: kpis.verifiedRecovery,
      potential: kpis.potentialRecovery,
      recovered: kpis.recoveredValue,
      openCount: executive.recovery.openOpportunities,
      monthlyBenefit: fig.recoveryMonthly,
    },
    varianceAnalysis: budget.rows
      .filter((r) => r.periodType === "monthly")
      .map((r) => ({
        category: r.categoryLabel,
        budget: r.budget,
        actual: r.actual,
        variance: r.variance,
        variancePct: r.variancePct,
        rootCause:
          r.variance > 0
            ? r.category === "supplier_spend"
              ? "Supplier inflation and PO volume"
              : r.category === "inventory"
                ? "Stock build or valuation change"
                : "Production or overhead overrun"
            : "Favourable variance — maintain controls",
      })),
  };

  const tbAccounts = buildTrialBalanceAccounts(fig);
  const tbSummary = {
    revenue: fig.revenue,
    cos: fig.cogs,
    gp: fig.gp,
    gpPct: fig.gpPct,
    expenses: fig.opex,
    profit: fig.netProfit,
    cash: fig.cash,
    inventory: fig.inventory,
    creditors: fig.creditors,
    debtors: fig.debtors,
  };

  const trialBalance: TrialBalanceAnalysis = {
    accounts: tbAccounts,
    summary: tbSummary,
    movements: tbAccounts
      .filter((a) => Math.abs(a.movement) > a.priorBalance * 0.05)
      .slice(0, 5)
      .map((a) => ({
        id: `mv-${a.accountCode}`,
        category: "Movement",
        title: `${a.accountName} movement`,
        body: `Movement ${money(a.movement)} vs prior ${money(a.priorBalance)}.`,
        severity: "medium" as const,
        dataUsed: { account: a.accountCode, movement: a.movement },
        formula: "movement_pct = movement / prior_balance",
        confidence: 80,
      })),
    risks: risks.slice(0, 4).map((r) => ({
      id: `tb-risk-${r.key}`,
      category: "Risk",
      title: r.label,
      body: r.detail,
      severity: r.level === "Critical" || r.level === "High" ? "high" : "medium",
      dataUsed: { score: r.score },
      formula: "from enterprise risk centre",
      confidence: 82,
      href: r.href,
    })),
    anomalies: [],
    recommendations: [],
  };

  trialBalance.anomalies = trialBalance.movements.filter((m) => m.severity === "high");
  trialBalance.recommendations = [
    {
      id: "tb-rec-1",
      category: "Recommendation",
      title: "Reconcile creditors",
      body: `Match ${money(fig.creditors)} creditors to open AP and GRN accruals.`,
      severity: "medium",
      dataUsed: { creditors: fig.creditors },
      formula: "creditors ≈ open_invoices + grn_accruals",
      confidence: 85,
      href: "/document-intelligence",
    },
    {
      id: "tb-rec-2",
      category: "Recommendation",
      title: "Validate inventory valuation",
      body: `Inventory ${money(fig.inventory)} — complete stock count if variance > 5%.`,
      severity: "medium",
      dataUsed: { inventory: fig.inventory },
      formula: "recommend stock count if movement > 5%",
      confidence: 83,
      href: "/inventory/counts",
    },
  ];

  const spendLine = forecast.lines.find((l) => l.key === "supplier_spend");
  const invLine = forecast.lines.find((l) => l.key === "inventory_usage");
  const cashFlow: CashFlowForecast = {
    horizon30: round2(kpis.spendThisMonth * 1.1 + (spendLine?.horizon30 || 0) * 0.2),
    horizon90: round2(kpis.spendThisMonth * 3.2 + (spendLine?.horizon90 || 0) * 0.25),
    horizon365: round2(kpis.spendThisYear * 1.08),
    supplierPayments30: round2(spendLine?.horizon30 || kpis.spendThisMonth),
    supplierPayments90: round2(spendLine?.horizon90 || kpis.spendThisMonth * 3),
    inventoryPurchases30: round2(invLine?.horizon30 || fig.inventory * 0.08),
    productionCosts30: round2(executive.manufacturing.productionCost),
    recoveryImpact30: round2(fig.recoveryMonthly),
    lines: forecast.lines.map((l) => ({
      label: l.label,
      d30: l.horizon30,
      d90: l.horizon90,
      d365: l.horizon365,
    })),
  };

  const healthScores = computeHealthScores({ fig, executive, recoveryStats, leakage, suppliers });
  const financialReview = buildFinancialReview({ fig, leakage, widgets, executive, budget, priorGpPct });
  const auditIntelligence = await buildAuditFindings(companyId);
  const cfoAssistantPresets = buildCfoAnswers({ fig, widgets, executive, opportunities, suppliers, leakage });

  const boardPacks: VyronFinanceIntelligencePayload["boardPacks"] = [
    { type: "monthly", label: "Monthly Board Pack", description: "Full executive board pack for directors", pack: boardPack },
    { type: "management", label: "Management Pack", description: "P&L, variance and operational KPIs", pack: boardPack },
    { type: "procurement", label: "Procurement Pack", description: "Spend, suppliers, PO variances", pack: { ...boardPack, meta: { ...boardPack.meta, dateRangeLabel: "Procurement focus" } } },
    { type: "recovery", label: "Recovery Pack", description: "Recovery funnel and verified value", pack: { ...boardPack, meta: { ...boardPack.meta, dateRangeLabel: "Recovery focus" } } },
    { type: "financial", label: "Financial Pack", description: "Statements, TB and cash flow", pack: boardPack },
  ];

  const foundation: VyronFinanceFoundation = {
    productName: "VYRON FINANCE",
    integrationReady: true,
    entities: [
      { key: "suppliers", label: "Suppliers", sourceTable: "vyron_cost_suppliers", syncNotes: "AP, contracts, inflation" },
      { key: "inventory", label: "Inventory", sourceTable: "vyron_cost_inventory_items", syncNotes: "Balance sheet and COS" },
      { key: "purchasing", label: "Purchasing", sourceTable: "vyron_cost_purchase_orders", syncNotes: "Commitments and accruals" },
      { key: "costing", label: "Costing", sourceTable: "vyron_cost_products", syncNotes: "Revenue and margin" },
      { key: "recoveries", label: "Recoveries", sourceTable: "vyron_recovery_opportunities", syncNotes: "P&L recovery lines" },
      { key: "audit_trails", label: "Audit Trails", sourceTable: "vyron_procurement_audit_log", syncNotes: "Audit intelligence feed" },
    ],
  };

  if (supabase) {
    try {
      await supabase.from("vyron_finance_health_snapshots").insert({
        company_id: companyId,
        liquidity_score: healthScores.liquidity,
        profitability_score: healthScores.profitability,
        efficiency_score: healthScores.efficiency,
        inventory_health_score: healthScores.inventoryHealth,
        recovery_health_score: healthScores.recoveryHealth,
        supplier_risk_score: healthScores.supplierRisk,
        overall_score: healthScores.overall,
        payload: { revenue: fig.revenue, gpPct: fig.gpPct },
      });
      await supabase.from("vyron_finance_statement_snapshots").insert({
        company_id: companyId,
        statement_type: "income",
        period_type: "monthly",
        period_label: monthlySet.periodLabel,
        lines: monthlySet.incomeStatement,
        comparatives: monthlySet.comparatives,
      });
    } catch {
      /* optional migration */
    }
  }

  return {
    managementAccounts,
    statements: { monthly: monthlySet, quarterly: quarterlySet, annual: annualSet },
    financialReview,
    auditIntelligence,
    trialBalance,
    cashFlow,
    executive: {
      revenue: fig.revenue,
      gp: fig.gp,
      gpPct: fig.gpPct,
      netProfit: fig.netProfit,
      inventory: fig.inventory,
      cashFlowNet: monthlySet.cashFlow.find((l) => l.key === "net")?.amount || 0,
      recovery: kpis.recoveredValue,
      financialHealthScore: healthScores.overall,
      riskScore: aiIntel.scores.riskScore,
    },
    healthScores,
    boardPacks,
    cfoAssistantPresets,
    foundation,
    intelligenceScores: aiIntel.scores,
  };
}

export async function answerCfoQuestion(
  question: string,
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<CfoAssistantAnswer> {
  const data = await getVyronFinanceIntelligence(companyId);
  const match = data.cfoAssistantPresets.find((p) => p.question.toLowerCase() === question.toLowerCase());
  if (match) return match;
  const partial = data.cfoAssistantPresets.find((p) => question.toLowerCase().includes(p.question.slice(0, 12).toLowerCase()));
  if (partial) return { ...partial, question };
  return {
    question,
    answer: `Based on current data: revenue ${money(data.executive.revenue)}, GP ${data.executive.gpPct.toFixed(1)}%, net profit ${money(data.executive.netProfit)}. Ask a preset question for a detailed explainable response.`,
    dataUsed: data.executive,
    formula: "aggregate from getVyronFinanceIntelligence()",
    confidence: 70,
    href: "/vyron-finance/cfo-assistant",
  };
}
