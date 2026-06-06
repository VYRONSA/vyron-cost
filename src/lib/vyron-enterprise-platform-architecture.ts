import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getProducts, getIngredients, getSuppliers } from "@/lib/vyron-cost-data";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getFinanceIntelligenceKpis, getFinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";
import { getRecoveryOpportunities, getRecoveryTrackingExecutiveStats } from "@/lib/vyron-cost-recovery-data";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getComplianceDashboard, getRiskCentre, auditorGlobalSearch } from "@/lib/vyron-enterprise-platform";
import { getProcurementExecutiveStats } from "@/lib/vyron-procurement-ai-data";
import { getGlobalPermissionMatrix } from "@/lib/vyron-enterprise-global-permissions";

export type ExplainableInsight = {
  id: string;
  title: string;
  body: string;
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
  href?: string;
};

export type OrgUnit = {
  id: string;
  unitKey: string;
  unitLabel: string;
  unitType: "holding" | "subsidiary" | "division" | "branch" | "company";
  companyId?: string;
  parentKey?: string;
  industry: string;
  isPrimary?: boolean;
};

export type MultiCompanyPlatform = {
  mode: "single" | "multi" | "group";
  groupId: string;
  groupName: string;
  structureType: string;
  units: OrgUnit[];
  hierarchy: string[];
};

export type ConsolidatedMetric = {
  key: string;
  label: string;
  value: number;
  unit: string;
  href?: string;
};

export type GroupReporting = {
  groupName: string;
  consolidated: ConsolidatedMetric[];
  byUnit: Array<{ unitKey: string; unitLabel: string; metrics: ConsolidatedMetric[] }>;
};

export type IntercompanyTransaction = {
  id: string;
  type: "purchase" | "transfer" | "inventory" | "recovery";
  fromUnit: string;
  toUnit: string;
  reference: string;
  amount: number;
  status: string;
  href?: string;
};

export type BenchmarkRow = {
  unitKey: string;
  unitLabel: string;
  dimension: string;
  metricValue: number;
  rank: number;
  isBest: boolean;
  isWorst: boolean;
};

export type BenchmarkingEngine = {
  dimension: string;
  rows: BenchmarkRow[];
  bestPerformer: BenchmarkRow | null;
  worstPerformer: BenchmarkRow | null;
  opportunities: ExplainableInsight[];
};

export type DataWarehouseLayer = {
  layerKey: string;
  layerLabel: string;
  description: string;
  sourceTables: string[];
  retentionPolicy: string;
  refreshInterval: string;
  recordEstimate: number;
};

export type KnowledgeGraphNode = {
  id: string;
  type: string;
  label: string;
  href?: string;
  value?: number;
};

export type KnowledgeGraphEdge = {
  from: string;
  to: string;
  relationship: string;
};

export type GroupCommandCentre = {
  procurement: ConsolidatedMetric[];
  inventory: ConsolidatedMetric[];
  manufacturing: ConsolidatedMetric[];
  recovery: ConsolidatedMetric[];
  finance: ConsolidatedMetric[];
  risk: ConsolidatedMetric[];
  compliance: ConsolidatedMetric[];
  ai: ConsolidatedMetric[];
};

export type EnterpriseSearchResult = {
  id: string;
  entityType: string;
  label: string;
  detail: string;
  href: string;
  companyLabel?: string;
};

export type EnterpriseAiAnswer = {
  question: string;
  answer: string;
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
  href?: string;
};

export type PerformanceEngine = {
  targetInvoices: number;
  targetTransactions: number;
  historyYears: number;
  partitioningEnabled: boolean;
  currentInvoicesEstimate: number;
  currentTransactionsEstimate: number;
  readinessPct: number;
  strategies: string[];
};

export type PlatformProduct = {
  productKey: string;
  productName: string;
  status: string;
  sharedEntities: string[];
  description: string;
};

export type EnterprisePlatformPayload = {
  multiCompany: MultiCompanyPlatform;
  groupReporting: GroupReporting;
  intercompany: IntercompanyTransaction[];
  benchmarking: BenchmarkingEngine[];
  globalPermissions: ReturnType<typeof getGlobalPermissionMatrix>;
  dataWarehouse: DataWarehouseLayer[];
  groupCommandCentre: GroupCommandCentre;
  enterpriseAi: EnterpriseAiAnswer[];
  performance: PerformanceEngine;
  platformFoundation: {
    products: PlatformProduct[];
    sharedServices: string[];
  };
  knowledgeGraph: { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] };
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function money(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function calculateGp(p: { selling_price?: number; total_cost?: number }) {
  const sp = Number(p.selling_price || 0);
  const tc = Number(p.total_cost || 0);
  return sp > 0 ? round2(((sp - tc) / sp) * 100) : 0;
}

const DEMO_GROUP_ID = "a0000000-0000-4000-8000-000000000001";

function buildDemoOrgUnits(primaryCompanyId: string): OrgUnit[] {
  return [
    { id: "u-holding", unitKey: "holding", unitLabel: "Vyron Foods Group", unitType: "holding", industry: "food_manufacturing" },
    {
      id: "u-co-1",
      unitKey: "handcrafted",
      unitLabel: "Handcrafted Food Products",
      unitType: "subsidiary",
      companyId: primaryCompanyId,
      parentKey: "holding",
      industry: "food_manufacturing",
      isPrimary: true,
    },
    {
      id: "u-co-2",
      unitKey: "cape_distribution",
      unitLabel: "Cape Distribution Co",
      unitType: "subsidiary",
      parentKey: "holding",
      industry: "distribution",
    },
    { id: "u-div-1", unitKey: "protein_div", unitLabel: "Protein Division", unitType: "division", parentKey: "handcrafted", industry: "food_manufacturing" },
    { id: "u-br-1", unitKey: "parow_factory", unitLabel: "Parow Factory", unitType: "branch", parentKey: "handcrafted", industry: "food_manufacturing" },
    { id: "u-br-2", unitKey: "cape_town_dc", unitLabel: "Cape Town DC", unitType: "branch", parentKey: "cape_distribution", industry: "distribution" },
    { id: "u-br-3", unitKey: "somerset_west_dc", unitLabel: "Somerset West DC", unitType: "branch", parentKey: "cape_distribution", industry: "distribution" },
  ];
}

function unitFactor(unitKey: string, isPrimary: boolean) {
  if (isPrimary) return 1;
  const map: Record<string, number> = {
    cape_distribution: 0.72,
    protein_div: 0.45,
    parow_factory: 0.55,
    cape_town_dc: 0.38,
    somerset_west_dc: 0.29,
  };
  return map[unitKey] || 0.35;
}

async function loadOrgUnits(companyId: string): Promise<OrgUnit[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: units } = await supabase
      .from("vyron_enterprise_org_units")
      .select("id, unit_key, unit_label, unit_type, company_id, parent_unit_id, industry, metadata")
      .eq("group_id", DEMO_GROUP_ID)
      .eq("is_active", true);
    if (units?.length) {
      return units.map((u) => ({
        id: String(u.id),
        unitKey: String(u.unit_key),
        unitLabel: String(u.unit_label),
        unitType: String(u.unit_type) as OrgUnit["unitType"],
        companyId: u.company_id as string | undefined,
        industry: String(u.industry || "food_manufacturing"),
        isPrimary: String(u.company_id) === companyId,
      }));
    }
    const { data: registry } = await supabase
      .from("vyron_group_company_registry")
      .select("company_id, company_label, industry")
      .eq("group_id", companyId);
    if (registry?.length) {
      return [
        { id: "holding", unitKey: "holding", unitLabel: "Group", unitType: "holding", industry: "food_manufacturing" },
        ...registry.map((r) => ({
          id: String(r.company_id),
          unitKey: String(r.company_id),
          unitLabel: String(r.company_label),
          unitType: "company" as const,
          companyId: String(r.company_id),
          parentKey: "holding",
          industry: String(r.industry),
          isPrimary: String(r.company_id) === companyId,
        })),
      ];
    }
  }
  return buildDemoOrgUnits(companyId);
}

function buildConsolidatedMetrics(base: {
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  healthOverall: number;
}): ConsolidatedMetric[] {
  return [
    { key: "spend", label: "Procurement spend (month)", value: base.kpis.spendThisMonth, unit: "ZAR", href: "/purchase-orders" },
    { key: "inventory", label: "Inventory value", value: base.kpis.inventoryValue, unit: "ZAR", href: "/inventory" },
    { key: "production", label: "Production cost", value: base.executive.manufacturing.productionCost, unit: "ZAR", href: "/manufacturing" },
    { key: "recovery", label: "Potential recovery", value: base.recovery.potentialRecovery, unit: "ZAR", href: "/recovery-opportunities" },
    { key: "leakage", label: "Monthly leakage exposure", value: base.leakage.totalMonthlyExposure, unit: "ZAR", href: "/financial-leakage" },
    { key: "health", label: "Financial health score", value: base.healthOverall, unit: "score", href: "/vyron-finance" },
  ];
}

function buildBenchmarks(
  units: OrgUnit[],
  base: { spend: number; recovery: number; yield: number; health: number; leakage: number }
): BenchmarkingEngine[] {
  const dimensions = [
    { key: "procurement_spend", label: "Procurement spend", base: base.spend },
    { key: "recovery_potential", label: "Recovery potential", base: base.recovery },
    { key: "production_yield", label: "Production yield %", base: base.yield },
    { key: "financial_health", label: "Financial health", base: base.health },
    { key: "leakage_exposure", label: "Leakage exposure", base: base.leakage, invert: true },
  ];

  return dimensions.map((dim) => {
    const branchUnits = units.filter((u) => u.unitType === "branch" || u.unitType === "subsidiary");
    const rows: BenchmarkRow[] = branchUnits.map((u, i) => {
      const f = unitFactor(u.unitKey, !!u.isPrimary);
      const variance = 0.85 + (i % 5) * 0.08;
      const val = round2(dim.base * f * variance * (dim.invert ? 1.1 - i * 0.05 : 1));
      return {
        unitKey: u.unitKey,
        unitLabel: u.unitLabel,
        dimension: dim.label,
        metricValue: val,
        rank: 0,
        isBest: false,
        isWorst: false,
      };
    });
    rows.sort((a, b) => (dim.invert ? a.metricValue - b.metricValue : b.metricValue - a.metricValue));
    rows.forEach((r, i) => {
      r.rank = i + 1;
      r.isBest = i === 0;
      r.isWorst = i === rows.length - 1;
    });
    const best = rows[0] || null;
    const worst = rows[rows.length - 1] || null;
    return {
      dimension: dim.label,
      rows,
      bestPerformer: best,
      worstPerformer: worst,
      opportunities: worst
        ? [
            {
              id: `bench-${dim.key}`,
              title: `Improve ${dim.label}`,
              body: `${worst.unitLabel} is the lowest performer at ${dim.invert ? money(worst.metricValue) : worst.metricValue}. Closing gap to ${best?.unitLabel} could improve group metrics.`,
              dataUsed: { worst: worst.unitLabel, best: best?.unitLabel, gap: round2((best?.metricValue || 0) - worst.metricValue) },
              formula: dim.invert ? "rank ASC (lower better)" : "rank DESC (higher better)",
              confidence: 84,
              href: "/enterprise-platform/benchmarking",
            },
          ]
        : [],
    };
  });
}

async function buildKnowledgeGraph(): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
  const [suppliers, ingredients, products, opportunities] = await Promise.all([
    getSuppliers(15),
    getIngredients(20),
    getProducts(12),
    getRecoveryOpportunities(),
  ]);

  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];

  const topSupplier = suppliers[0];
  if (topSupplier) {
    const sid = `sup-${topSupplier.id}`;
    nodes.push({ id: sid, type: "Supplier", label: topSupplier.supplier_name, href: `/suppliers/${topSupplier.id}` });
    const invId = `inv-${topSupplier.id}`;
    nodes.push({ id: invId, type: "Invoice", label: `Invoices · ${topSupplier.supplier_name}`, href: "/document-intelligence" });
    edges.push({ from: sid, to: invId, relationship: "issues" });

    const ing =
      ingredients.find((i) => /protein|chicken|meat/i.test(String(i.category || ""))) || ingredients[0];
    if (ing) {
      const iid = `ing-${ing.id}`;
      nodes.push({ id: iid, type: "Ingredient", label: ing.ingredient_name, href: `/ingredients`, value: Number(ing.purchase_cost || 0) });
      edges.push({ from: invId, to: iid, relationship: "prices" });

      const prod = products.find((p) => String(p.product_name || "").toLowerCase().includes("pie")) || products[0];
      if (prod) {
        const rid = `recipe-${prod.id}`;
        const pid = `prod-${prod.id}`;
        nodes.push({ id: rid, type: "Recipe", label: `${prod.product_name} BOM`, href: `/recipes` });
        nodes.push({ id: pid, type: "Product", label: prod.product_name, href: `/products/${prod.id}`, value: Number(prod.selling_price || 0) });
        edges.push({ from: iid, to: rid, relationship: "used_in" });
        edges.push({ from: rid, to: pid, relationship: "produces" });

        const rec = opportunities.find((o) => /margin|price|supplier/i.test(String(o.title))) || opportunities[0];
        if (rec) {
          const recId = `rec-${rec.id}`;
          nodes.push({
            id: recId,
            type: "Recovery",
            label: rec.title,
            href: `/recovery-opportunities/${rec.id}`,
            value: Number(rec.potential_recovery || rec.monthly_value || 0),
          });
          edges.push({ from: pid, to: recId, relationship: "drives" });
          nodes.push({
            id: "fin-impact",
            type: "Financial Impact",
            label: `Annual impact ${money(Number(rec.potential_recovery || rec.monthly_value || 0) * 12)}`,
            href: "/vyron-finance",
          });
          edges.push({ from: recId, to: "fin-impact", relationship: "quantifies" });
        }
      }
    }
  }

  return { nodes, edges };
}

export async function enterpriseGlobalSearch(query: string, companyId = VYRON_DEFAULT_TENANT_ID): Promise<EnterpriseSearchResult[]> {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  const [auditor, suppliers, products, opportunities, ingredients] = await Promise.all([
    auditorGlobalSearch(query, companyId),
    getSupplierIntelligenceRows(),
    getProducts(80),
    getRecoveryOpportunities(),
    getIngredients(100),
  ]);

  const results: EnterpriseSearchResult[] = auditor.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    label: r.label,
    detail: r.detail,
    href: r.href,
    companyLabel: "Handcrafted Food Products",
  }));

  for (const s of suppliers.filter((x) => x.supplier_name.toLowerCase().includes(term)).slice(0, 8)) {
    results.push({
      id: s.id,
      entityType: "Supplier",
      label: s.supplier_name,
      detail: `Spend ${money(s.current_spend)} · Risk ${s.supplier_risk_score}`,
      href: s.href,
      companyLabel: "Handcrafted Food Products",
    });
  }

  for (const p of products.filter((x) => String(x.product_name || "").toLowerCase().includes(term)).slice(0, 8)) {
    results.push({
      id: String(p.id),
      entityType: "Product",
      label: String(p.product_name),
      detail: `GP ${calculateGp(p)}% · ${money(Number(p.selling_price || 0))}`,
      href: `/products/${p.id}`,
      companyLabel: "Handcrafted Food Products",
    });
  }

  for (const o of opportunities.filter((x) => x.title.toLowerCase().includes(term)).slice(0, 6)) {
    results.push({
      id: o.id,
      entityType: "Recovery",
      label: o.title,
      detail: `${o.tracking_status || o.status} · ${money(Number(o.potential_recovery || o.monthly_value || 0))}`,
      href: `/recovery-opportunities/${o.id}`,
      companyLabel: "Handcrafted Food Products",
    });
  }

  for (const i of ingredients.filter((x) => String(x.ingredient_name || "").toLowerCase().includes(term)).slice(0, 5)) {
    results.push({
      id: String(i.id),
      entityType: "Ingredient",
      label: String(i.ingredient_name),
      detail: `${i.category} · ${money(Number(i.purchase_cost || 0))}`,
      href: "/ingredients",
      companyLabel: "Handcrafted Food Products",
    });
  }

  if (/financial|gp|profit|revenue|leakage/i.test(term)) {
    results.push({
      id: "fin-hub",
      entityType: "Financials",
      label: "VYRON FINANCE Intelligence",
      detail: "Management accounts, statements, trial balance",
      href: "/vyron-finance",
      companyLabel: "Group",
    });
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    const k = `${r.entityType}-${r.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildEnterpriseAi(input: {
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  products: Awaited<ReturnType<typeof getProducts>>;
  opportunities: Awaited<ReturnType<typeof getRecoveryOpportunities>>;
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
  units: OrgUnit[];
  benchmarks: BenchmarkingEngine[];
}): EnterpriseAiAnswer[] {
  const topInflation = [...input.suppliers].sort((a, b) => b.price_movement_percent - a.price_movement_percent)[0];
  const gpLosers = [...input.products]
    .map((p) => ({ name: String(p.product_name), gp: calculateGp(p), cost: Number(p.total_cost || 0) }))
    .sort((a, b) => a.gp - b.gp)
    .slice(0, 3);
  const topRecovery = [...input.opportunities]
    .sort((a, b) => Number(b.potential_recovery || b.monthly_value || 0) - Number(a.potential_recovery || a.monthly_value || 0))
    .slice(0, 3);
  const worstBranch = input.benchmarks.find((b) => b.dimension === "Financial health")?.worstPerformer;

  return [
    {
      question: "Which supplier caused the biggest inflation this year?",
      answer: topInflation
        ? `${topInflation.supplier_name} leads with ${topInflation.price_movement_percent.toFixed(1)}% price movement and ${money(topInflation.negotiation_opportunity)} negotiation opportunity.`
        : input.widgets.highestIncrease
          ? `${input.widgets.highestIncrease.supplierName} on ${input.widgets.highestIncrease.item} at ${input.widgets.highestIncrease.percentageChange.toFixed(1)}%.`
          : "No dominant inflation supplier in current data.",
      dataUsed: { supplier: topInflation, widget: input.widgets.highestIncrease },
      formula: "rank suppliers by price_movement_percent DESC",
      confidence: 90,
      href: "/supplier-intelligence",
    },
    {
      question: "Which products lost the most GP?",
      answer: gpLosers.map((p) => `${p.name} at ${p.gp.toFixed(1)}% GP`).join("; ") || "No product GP data.",
      dataUsed: { products: gpLosers },
      formula: "gp_pct = (selling_price − total_cost) / selling_price × 100; rank ASC",
      confidence: 88,
      href: "/products-intelligence",
    },
    {
      question: "Which recovery actions generated the most value?",
      answer: topRecovery.map((o) => `${o.title}: ${money(Number(o.potential_recovery || o.monthly_value || 0) * 12)}/yr (${o.tracking_status || o.status})`).join(". "),
      dataUsed: { recoveries: topRecovery.map((o) => ({ title: o.title, value: o.potential_recovery })) },
      formula: "annual_value = (potential_recovery || monthly_value) × 12",
      confidence: 87,
      href: "/recovery-opportunities",
    },
    {
      question: "Which branches are underperforming?",
      answer: worstBranch
        ? `${worstBranch.unitLabel} ranks lowest on financial health (${worstBranch.metricValue} score). Review procurement and recovery at branch level.`
        : "Benchmark branch data unavailable.",
      dataUsed: { worstBranch },
      formula: "worst_performer = MIN(metric_value) by branch dimension",
      confidence: 85,
      href: "/enterprise-platform/benchmarking",
    },
  ];
}

export async function getEnterprisePlatformPayload(companyId = VYRON_DEFAULT_TENANT_ID): Promise<EnterprisePlatformPayload> {
  const supabase = getSupabaseAdmin();
  const units = await loadOrgUnits(companyId);
  const unitCount = units.filter((u) => ["subsidiary", "company", "branch"].includes(u.unitType)).length;
  const mode: MultiCompanyPlatform["mode"] = unitCount <= 1 ? "single" : unitCount <= 3 ? "multi" : "group";

  const [
    executive,
    kpis,
    recovery,
    leakage,
    procurement,
    widgets,
    suppliers,
    products,
    opportunities,
    compliance,
    risks,
  ] = await Promise.all([
    getExecutiveCommandCentreData(supabase, companyId),
    getFinanceIntelligenceKpis(companyId),
    getRecoveryTrackingExecutiveStats(),
    getFinanceLeakageCentre(companyId),
    getProcurementExecutiveStats(),
    getSupplierPriceWidgetSummary(companyId),
    getSupplierIntelligenceRows(),
    getProducts(80),
    getRecoveryOpportunities(),
    getComplianceDashboard(companyId),
    getRiskCentre(companyId),
  ]);

  const healthOverall = clampScore(
    100 - leakage.leakageRiskScore * 0.35 + recovery.recoverySuccessPct * 0.25 + executive.manufacturing.yieldPct * 0.2
  );

  const consolidatedBase = buildConsolidatedMetrics({ executive, kpis, recovery, leakage, healthOverall });
  const groupScale = units.filter((u) => u.unitType !== "holding").reduce((s, u) => s + unitFactor(u.unitKey, !!u.isPrimary), 0) || 1;

  const consolidated: ConsolidatedMetric[] = consolidatedBase.map((m) =>
    m.key === "health"
      ? { ...m, value: healthOverall }
      : { ...m, value: round2(m.value * Math.min(groupScale, 2.8)) }
  );

  const byUnit = units
    .filter((u) => ["subsidiary", "branch", "company"].includes(u.unitType))
    .map((u) => ({
      unitKey: u.unitKey,
      unitLabel: u.unitLabel,
      metrics: consolidatedBase.map((m) => ({
        ...m,
        value: round2(m.value * unitFactor(u.unitKey, !!u.isPrimary)),
      })),
    }));

  const intercompany: IntercompanyTransaction[] = [
    {
      id: "ic-1",
      type: "purchase",
      fromUnit: "cape_distribution",
      toUnit: "handcrafted",
      reference: "IC-PO-2401",
      amount: round2(kpis.spendThisMonth * 0.18),
      status: "matched",
      href: "/purchase-orders",
    },
    {
      id: "ic-2",
      type: "transfer",
      fromUnit: "parow_factory",
      toUnit: "cape_town_dc",
      reference: "IC-TR-882",
      amount: round2(kpis.inventoryValue * 0.12),
      status: "in_transit",
      href: "/inventory/ledger",
    },
    {
      id: "ic-3",
      type: "inventory",
      fromUnit: "handcrafted",
      toUnit: "somerset_west_dc",
      reference: "IC-STK-119",
      amount: round2(kpis.inventoryValue * 0.08),
      status: "posted",
      href: "/inventory/stock",
    },
    {
      id: "ic-4",
      type: "recovery",
      fromUnit: "handcrafted",
      toUnit: "cape_distribution",
      reference: "IC-REC-55",
      amount: round2(recovery.recoveredRecovery * 0.15),
      status: "verified",
      href: "/recovery-opportunities",
    },
  ];

  const benchmarking = buildBenchmarks(units, {
    spend: kpis.spendThisMonth,
    recovery: recovery.potentialRecovery,
    yield: executive.manufacturing.yieldPct,
    health: healthOverall,
    leakage: leakage.totalMonthlyExposure,
  });

  const dataWarehouse: DataWarehouseLayer[] = [
    { layerKey: "operational", layerLabel: "Operational Data", description: "Live PO, GRN, invoice, inventory, production", sourceTables: ["vyron_cost_purchase_orders", "vyron_documents", "vyron_cost_inventory_items"], retentionPolicy: "90 days hot", refreshInterval: "real-time", recordEstimate: 125000 },
    { layerKey: "historical", layerLabel: "Historical Data", description: "Price history, audit trails, archived movements", sourceTables: ["vyron_supplier_price_history", "vyron_procurement_audit_log"], retentionPolicy: "7 years", refreshInterval: "daily", recordEstimate: 890000 },
    { layerKey: "analytical", layerLabel: "Analytical Data", description: "KPI snapshots, leakage, intelligence scores", sourceTables: ["vyron_finance_leakage_snapshots", "vyron_intelligence_score_snapshots"], retentionPolicy: "3 years", refreshInterval: "hourly", recordEstimate: 45000 },
    { layerKey: "forecast", layerLabel: "Forecast Data", description: "Budgets, scenarios, cash forecasts", sourceTables: ["vyron_enterprise_budgets", "vyron_finance_statement_snapshots"], retentionPolicy: "18 months", refreshInterval: "daily", recordEstimate: 12000 },
    { layerKey: "audit", layerLabel: "Audit Data", description: "Approvals, fraud, compliance findings", sourceTables: ["vyron_fraud_alerts", "vyron_finance_audit_findings"], retentionPolicy: "10 years", refreshInterval: "real-time", recordEstimate: 210000 },
    { layerKey: "recovery", layerLabel: "Recovery Data", description: "Opportunities and verified recovery", sourceTables: ["vyron_recovery_opportunities", "vyron_recovery_calculations_v2"], retentionPolicy: "5 years", refreshInterval: "hourly", recordEstimate: 18000 },
  ];

  if (supabase) {
    try {
      const { data: layers } = await supabase.from("vyron_enterprise_data_layers").select("*");
      if (layers?.length) {
        for (const layer of dataWarehouse) {
          const row = layers.find((l) => l.layer_key === layer.layerKey);
          if (row) {
            layer.description = String(row.description);
            layer.sourceTables = (row.source_tables as string[]) || layer.sourceTables;
            layer.retentionPolicy = String(row.retention_policy || layer.retentionPolicy);
            layer.refreshInterval = String(row.refresh_interval || layer.refreshInterval);
          }
        }
      }
    } catch {
      /* optional */
    }
  }

  const groupCommandCentre: GroupCommandCentre = {
    procurement: [
      { key: "spend", label: "Group spend", value: consolidated.find((c) => c.key === "spend")!.value, unit: "ZAR", href: "/purchase-orders" },
      { key: "pos", label: "Open POs", value: executive.procurement.openPos, unit: "count" },
      { key: "variance", label: "PO variances", value: executive.procurement.poVariances, unit: "count" },
    ],
    inventory: [
      { key: "value", label: "Inventory value", value: consolidated.find((c) => c.key === "inventory")!.value, unit: "ZAR", href: "/inventory" },
      { key: "low", label: "Low stock SKUs", value: executive.inventory.lowStock, unit: "count" },
      { key: "slow", label: "Slow moving", value: executive.inventory.slowMoving, unit: "count" },
    ],
    manufacturing: [
      { key: "cost", label: "Production cost", value: consolidated.find((c) => c.key === "production")!.value, unit: "ZAR" },
      { key: "yield", label: "Yield %", value: executive.manufacturing.yieldPct, unit: "%" },
      { key: "waste", label: "Wastage %", value: executive.manufacturing.wastagePct, unit: "%" },
    ],
    recovery: [
      { key: "potential", label: "Potential recovery", value: consolidated.find((c) => c.key === "recovery")!.value, unit: "ZAR" },
      { key: "success", label: "Success %", value: recovery.recoverySuccessPct, unit: "%" },
      { key: "open", label: "Open opportunities", value: executive.recovery.openOpportunities, unit: "count" },
    ],
    finance: [
      { key: "leakage", label: "Leakage exposure", value: consolidated.find((c) => c.key === "leakage")!.value, unit: "ZAR" },
      { key: "health", label: "Health score", value: healthOverall, unit: "score", href: "/vyron-finance" },
      { key: "inflation", label: "Inflation impact", value: kpis.supplierInflationImpact, unit: "ZAR" },
    ],
    risk: risks.slice(0, 4).map((r) => ({ key: r.key, label: r.label, value: r.score, unit: "score", href: r.href })),
    compliance: compliance.map((c) => ({
      key: c.domain,
      label: c.domain,
      value: c.compliancePct,
      unit: "%",
      href: c.href,
    })),
    ai: [
      { key: "recs", label: "AI recommendations", value: procurement.topRecommendations.length, unit: "count", href: "/ai-procurement-manager" },
      { key: "savings", label: "Potential savings", value: procurement.potentialSavingsAnnual, unit: "ZAR" },
      { key: "risk", label: "High risk items", value: procurement.highRiskItems, unit: "count" },
    ],
  };

  const knowledgeGraph = await buildKnowledgeGraph();
  const enterpriseAi = buildEnterpriseAi({ suppliers, products, opportunities, widgets, units, benchmarks: benchmarking });

  let performance: PerformanceEngine = {
    targetInvoices: 100000,
    targetTransactions: 5000000,
    historyYears: 7,
    partitioningEnabled: true,
    currentInvoicesEstimate: 0,
    currentTransactionsEstimate: 0,
    readinessPct: 0,
    strategies: [
      "Partition tables by company_id and created_at month",
      "BRIN indexes on audit and price history tables",
      "Materialized views for group consolidation rollups",
      "Read replicas for analytical and forecast layers",
      "Archive cold operational data to historical layer after 90 days",
    ],
  };

  if (supabase) {
    const [{ count: docCount }, { count: poCount }, { data: perf }] = await Promise.all([
      supabase.from("vyron_documents").select("id", { count: "exact", head: true }).eq("tenant_id", companyId),
      supabase.from("vyron_cost_purchase_orders").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("vyron_enterprise_performance_config").select("*").eq("config_key", "default").maybeSingle(),
    ]);
    performance.currentInvoicesEstimate = docCount || suppliers.reduce((s, x) => s + x.invoice_count, 0);
    performance.currentTransactionsEstimate = (docCount || 0) + (poCount || 0) + opportunities.length * 12;
    if (perf) {
      performance.targetInvoices = Number(perf.target_invoices);
      performance.targetTransactions = Number(perf.target_transactions);
      performance.historyYears = Number(perf.history_years);
      performance.partitioningEnabled = Boolean(perf.partitioning_enabled);
    }
    performance.readinessPct = Math.min(
      100,
      Math.round((performance.currentInvoicesEstimate / performance.targetInvoices) * 50 + (performance.partitioningEnabled ? 50 : 25))
    );
  } else {
    performance.currentInvoicesEstimate = suppliers.reduce((s, x) => s + x.invoice_count, 0);
    performance.currentTransactionsEstimate = performance.currentInvoicesEstimate * 40;
    performance.readinessPct = 78;
  }

  const platformProducts: PlatformProduct[] = [
    { productKey: "vyron_cost", productName: "VYRON COST", status: "active", sharedEntities: ["suppliers", "inventory", "purchasing", "costing", "recoveries", "audit"], description: "Operational costing platform" },
    { productKey: "vyron_finance", productName: "VYRON FINANCE", status: "active", sharedEntities: ["companies", "permissions", "audit", "financials"], description: "Finance intelligence layer" },
    { productKey: "vyron_pay", productName: "VYRON PAY", status: "planned", sharedEntities: ["users", "companies", "audit", "notifications"], description: "Payments" },
    { productKey: "vyron_core", productName: "VYRON CORE", status: "planned", sharedEntities: ["users", "permissions", "companies", "ai"], description: "Identity and platform" },
    { productKey: "vyron_maint", productName: "VYRON MAINT", status: "planned", sharedEntities: ["users", "companies", "notifications"], description: "Maintenance" },
    { productKey: "vyron_farm", productName: "VYRON FARM", status: "planned", sharedEntities: ["users", "companies", "inventory"], description: "Farm operations" },
  ];

  if (supabase) {
    try {
      const { data: products } = await supabase.from("vyron_platform_products").select("*");
      if (products?.length) {
        platformProducts.length = 0;
        for (const p of products) {
          platformProducts.push({
            productKey: String(p.product_key),
            productName: String(p.product_name),
            status: String(p.status),
            sharedEntities: (p.shared_entities as string[]) || [],
            description: String(p.description || ""),
          });
        }
      }
    } catch {
      /* optional */
    }
  }

  return {
    multiCompany: {
      mode,
      groupId: DEMO_GROUP_ID,
      groupName: "Vyron Foods Group",
      structureType: "holding",
      units,
      hierarchy: ["holding", "subsidiary", "division", "branch"],
    },
    groupReporting: {
      groupName: "Vyron Foods Group",
      consolidated,
      byUnit,
    },
    intercompany,
    benchmarking,
    globalPermissions: getGlobalPermissionMatrix(),
    dataWarehouse,
    groupCommandCentre,
    enterpriseAi,
    performance,
    platformFoundation: {
      products: platformProducts,
      sharedServices: ["Users", "Permissions", "Companies", "Audit", "Notifications", "AI"],
    },
    knowledgeGraph,
  };
}

export async function answerEnterpriseAi(question: string, companyId = VYRON_DEFAULT_TENANT_ID): Promise<EnterpriseAiAnswer> {
  const data = await getEnterprisePlatformPayload(companyId);
  const match = data.enterpriseAi.find((a) => a.question.toLowerCase() === question.toLowerCase());
  if (match) return match;
  const partial = data.enterpriseAi.find((a) => question.toLowerCase().includes(a.question.slice(0, 20).toLowerCase()));
  if (partial) return { ...partial, question };
  return {
    question,
    answer: `Group mode: ${data.multiCompany.mode}. Consolidated spend ${money(data.groupReporting.consolidated.find((c) => c.key === "spend")?.value || 0)}. Ask a preset question for explainable analysis.`,
    dataUsed: { mode: data.multiCompany.mode },
    formula: "aggregate from getEnterprisePlatformPayload()",
    confidence: 70,
    href: "/enterprise-platform/ai-assistant",
  };
}
