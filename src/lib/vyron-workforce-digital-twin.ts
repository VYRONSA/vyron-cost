import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import type { HeatmapCell, TrendPoint, AiFeedItem } from "@/lib/vyron-executive-command-centre";
import { getFinancialLeakageDashboard } from "@/lib/vyron-leakage-intelligence-data";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { buildWorkforceModuleBundle, type WorkforceModuleBundle } from "@/lib/vyron-workforce-modules";

export type WorkforceTwinRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  clockInRate: number;
  productivityIndex: number;
  travelKmMonth: number;
  fieldVisitsMonth: number;
  costPerHour: number;
  riskScore: number;
  healthScore: number;
  attritionProbability: number;
};

export type WorkforceForecastRow = {
  id: string;
  forecastType: string;
  periodLabel: string;
  forecastValue: number;
  confidence: number;
};

export type WorkforceSimulationRow = {
  id: string;
  scenarioName: string;
  scenarioType: string;
  inputParams: Record<string, unknown>;
  outputResults: Record<string, unknown>;
  status: string;
  createdAt: string;
};

export type WorkforceHealthScoreRow = {
  id: string;
  department: string;
  score: number;
  labourCostScore: number;
  productivityScore: number;
  clockingScore: number;
  fieldOpsScore: number;
  travelScore: number;
  riskScore: number;
  recordedAt: string;
};

export type VyronCoreCommandCentrePayload = {
  headline: {
    labourCost: number;
    productivity: number;
    workforceHealth: number;
    risk: number;
    predictedLeakage: number;
  };
  modules: WorkforceModuleBundle;
  twins: WorkforceTwinRow[];
  heatmap: HeatmapCell[];
  forecasts: WorkforceForecastRow[];
  simulations: WorkforceSimulationRow[];
  healthScores: WorkforceHealthScoreRow[];
  attritionForecast: TrendPoint[];
  trends: {
    labourCostTrend: TrendPoint[];
    productivityTrend: TrendPoint[];
    healthTrend: TrendPoint[];
    leakageTrend: TrendPoint[];
  };
  aiExecutiveSummary: {
    summary: string;
    bullets: string[];
    insights: AiFeedItem[];
  };
};

const SEED_TWINS: Omit<WorkforceTwinRow, "id">[] = [
  { employeeId: "EMP-001", employeeName: "Thabo Mokoena", department: "Production", role: "Line Supervisor", clockInRate: 96, productivityIndex: 88, travelKmMonth: 120, fieldVisitsMonth: 4, costPerHour: 185, riskScore: 22, healthScore: 84, attritionProbability: 0.08 },
  { employeeId: "EMP-002", employeeName: "Lerato Naidoo", department: "Field Sales", role: "Route Rep", clockInRate: 89, productivityIndex: 92, travelKmMonth: 680, fieldVisitsMonth: 38, costPerHour: 142, riskScore: 28, healthScore: 79, attritionProbability: 0.14 },
  { employeeId: "EMP-003", employeeName: "James van Wyk", department: "Warehouse", role: "Picker", clockInRate: 94, productivityIndex: 86, travelKmMonth: 40, fieldVisitsMonth: 0, costPerHour: 98, riskScore: 18, healthScore: 88, attritionProbability: 0.06 },
  { employeeId: "EMP-004", employeeName: "Nomsa Dlamini", department: "Field Service", role: "Technician", clockInRate: 87, productivityIndex: 81, travelKmMonth: 520, fieldVisitsMonth: 28, costPerHour: 156, riskScore: 41, healthScore: 72, attritionProbability: 0.22 },
  { employeeId: "EMP-005", employeeName: "Pieter Botha", department: "Production", role: "Machine Operator", clockInRate: 92, productivityIndex: 90, travelKmMonth: 60, fieldVisitsMonth: 2, costPerHour: 128, riskScore: 25, healthScore: 86, attritionProbability: 0.09 },
  { employeeId: "EMP-006", employeeName: "Zanele Khumalo", department: "Admin", role: "Payroll Clerk", clockInRate: 98, productivityIndex: 94, travelKmMonth: 80, fieldVisitsMonth: 1, costPerHour: 118, riskScore: 12, healthScore: 91, attritionProbability: 0.05 },
  { employeeId: "EMP-007", employeeName: "David Fourie", department: "Field Sales", role: "Key Account Rep", clockInRate: 85, productivityIndex: 78, travelKmMonth: 740, fieldVisitsMonth: 32, costPerHour: 168, riskScore: 48, healthScore: 68, attritionProbability: 0.31 },
  { employeeId: "EMP-008", employeeName: "Aisha Patel", department: "Quality", role: "QA Inspector", clockInRate: 95, productivityIndex: 89, travelKmMonth: 200, fieldVisitsMonth: 12, costPerHour: 134, riskScore: 20, healthScore: 87, attritionProbability: 0.07 },
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function lastNMonthsLabels(n: number): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    out.push({
      label: d.toLocaleDateString("en-ZA", { month: "short" }),
      value: 0,
    });
  }
  return out;
}

function heatLevel(value: number, thresholds: [number, number, number]): HeatmapCell["level"] {
  if (value >= thresholds[2]) return "critical";
  if (value >= thresholds[1]) return "high";
  if (value >= thresholds[0]) return "medium";
  return "low";
}

function mapTwinRow(row: Record<string, unknown>): WorkforceTwinRow {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name),
    department: String(row.department),
    role: String(row.role),
    clockInRate: Number(row.clock_in_rate || 0),
    productivityIndex: Number(row.productivity_index || 0),
    travelKmMonth: Number(row.travel_km_month || 0),
    fieldVisitsMonth: Number(row.field_visits_month || 0),
    costPerHour: Number(row.cost_per_hour || 0),
    riskScore: Number(row.risk_score || 0),
    healthScore: Number(row.health_score || 0),
    attritionProbability: Number(row.attrition_probability || 0),
  };
}

async function loadTwins(supabase: SupabaseClient | null, companyId: string): Promise<WorkforceTwinRow[]> {
  if (supabase) {
    const { data } = await supabase
      .from("workforce_digital_twin")
      .select("*")
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("department")
      .limit(50);
    if (data?.length) return data.map((row) => mapTwinRow(row as Record<string, unknown>));
  }
  return SEED_TWINS.map((t, i) => ({ id: `seed-${i}`, ...t }));
}

async function loadForecasts(supabase: SupabaseClient | null, companyId: string): Promise<WorkforceForecastRow[]> {
  if (supabase) {
    const { data } = await supabase
      .from("workforce_forecasts")
      .select("*")
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(24);
    if (data?.length) {
      return data.map((row) => ({
        id: String(row.id),
        forecastType: String(row.forecast_type),
        periodLabel: String(row.period_label),
        forecastValue: Number(row.forecast_value || 0),
        confidence: Number(row.confidence || 0),
      }));
    }
  }
  return buildDefaultForecasts();
}

async function loadSimulations(supabase: SupabaseClient | null, companyId: string): Promise<WorkforceSimulationRow[]> {
  if (supabase) {
    const { data } = await supabase
      .from("workforce_simulations")
      .select("*")
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data?.length) {
      return data.map((row) => ({
        id: String(row.id),
        scenarioName: String(row.scenario_name),
        scenarioType: String(row.scenario_type),
        inputParams: (row.input_params || {}) as Record<string, unknown>,
        outputResults: (row.output_results || {}) as Record<string, unknown>,
        status: String(row.status || "completed"),
        createdAt: String(row.created_at),
      }));
    }
  }
  return buildDefaultSimulations();
}

async function loadHealthScores(supabase: SupabaseClient | null, companyId: string): Promise<WorkforceHealthScoreRow[]> {
  if (supabase) {
    const { data } = await supabase
      .from("workforce_health_scores")
      .select("*")
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("recorded_at", { ascending: false })
      .limit(20);
    if (data?.length) {
      return data.map((row) => ({
        id: String(row.id),
        department: String(row.department),
        score: Number(row.score || 0),
        labourCostScore: Number(row.labour_cost_score || 0),
        productivityScore: Number(row.productivity_score || 0),
        clockingScore: Number(row.clocking_score || 0),
        fieldOpsScore: Number(row.field_ops_score || 0),
        travelScore: Number(row.travel_score || 0),
        riskScore: Number(row.risk_score || 0),
        recordedAt: String(row.recorded_at),
      }));
    }
  }
  return buildDefaultHealthScores();
}

function buildDefaultForecasts(): WorkforceForecastRow[] {
  const months = lastNMonthsLabels(6);
  const types = ["labour_cost", "productivity", "attrition", "leakage", "workforce_health"] as const;
  const rows: WorkforceForecastRow[] = [];
  let i = 0;
  for (const type of types) {
    for (const m of months.slice(-3)) {
      rows.push({
        id: `fc-${i++}`,
        forecastType: type,
        periodLabel: m.label,
        forecastValue:
          type === "labour_cost" ? 420000 + Math.random() * 30000
          : type === "productivity" ? 82 + Math.random() * 8
          : type === "attrition" ? 4 + Math.random() * 3
          : type === "leakage" ? 58000 + Math.random() * 20000
          : 78 + Math.random() * 10,
        confidence: round2(72 + Math.random() * 18),
      });
    }
  }
  return rows;
}

function buildDefaultSimulations(): WorkforceSimulationRow[] {
  return [
    {
      id: "sim-1",
      scenarioName: "Reduce overtime 15%",
      scenarioType: "overtime",
      inputParams: { overtimeReductionPct: 15 },
      outputResults: { labourCostSaving: 5760, productivityImpact: -1.2, riskDelta: -2 },
      status: "completed",
      createdAt: new Date().toISOString(),
    },
    {
      id: "sim-2",
      scenarioName: "Field coverage +2 reps",
      scenarioType: "field_coverage",
      inputParams: { additionalReps: 2 },
      outputResults: { visitCompletionDelta: 8.4, labourCostDelta: 28400, leakageReduction: 12400 },
      status: "completed",
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildDefaultHealthScores(): WorkforceHealthScoreRow[] {
  const depts = ["Production", "Field Sales", "Warehouse", "Field Service", "Quality", "Admin"];
  return depts.map((department, i) => ({
    id: `hs-${i}`,
    department,
    score: round2(72 + Math.random() * 18),
    labourCostScore: round2(70 + Math.random() * 20),
    productivityScore: round2(75 + Math.random() * 15),
    clockingScore: round2(80 + Math.random() * 15),
    fieldOpsScore: round2(68 + Math.random() * 22),
    travelScore: round2(65 + Math.random() * 25),
    riskScore: round2(20 + Math.random() * 30),
    recordedAt: new Date().toISOString(),
  }));
}

function buildHeatmap(modules: WorkforceModuleBundle, twins: WorkforceTwinRow[]): HeatmapCell[] {
  const deptRisk = new Map<string, number[]>();
  for (const t of twins) {
    const arr = deptRisk.get(t.department) || [];
    arr.push(t.riskScore);
    deptRisk.set(t.department, arr);
  }

  const cells: HeatmapCell[] = [
    { area: "Clocking", metric: "Late arrivals", value: modules.clocking.lateArrivals, level: heatLevel(modules.clocking.lateArrivals, [8, 15, 25]) },
    { area: "Clocking", metric: "Absenteeism %", value: modules.clocking.absenteeismRate, level: heatLevel(modules.clocking.absenteeismRate, [2, 4, 6]) },
    { area: "Field Operations", metric: "Open jobs", value: modules.fieldOperations.openJobs, level: heatLevel(modules.fieldOperations.openJobs, [10, 18, 30]) },
    { area: "Field Operations", metric: "Completion %", value: modules.fieldOperations.completionRate, level: modules.fieldOperations.completionRate < 85 ? "high" : modules.fieldOperations.completionRate < 92 ? "medium" : "low" },
    { area: "Travel", metric: "Policy breaches", value: modules.travelIntelligence.policyBreaches, level: heatLevel(modules.travelIntelligence.policyBreaches, [2, 5, 8]) },
    { area: "Travel", metric: "Idle travel %", value: modules.travelIntelligence.idleTravelPct, level: heatLevel(modules.travelIntelligence.idleTravelPct, [8, 12, 18]) },
    { area: "Cost", metric: "Overtime cost", value: modules.costIntelligence.overtimeCost, level: heatLevel(modules.costIntelligence.overtimeCost, [25000, 35000, 50000]) },
    { area: "Cost", metric: "Agency cost", value: modules.costIntelligence.agencyCost, level: heatLevel(modules.costIntelligence.agencyCost, [15000, 22000, 35000]) },
    { area: "Risk", metric: "Compliance flags", value: modules.riskIntelligence.complianceFlags, level: heatLevel(modules.riskIntelligence.complianceFlags, [3, 6, 10]) },
    { area: "Risk", metric: "Predicted leakage", value: modules.riskIntelligence.predictedLeakage, level: heatLevel(modules.riskIntelligence.predictedLeakage, [40000, 60000, 90000]) },
  ];

  for (const [dept, scores] of deptRisk) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    cells.push({
      area: "Department Risk",
      metric: dept,
      value: round2(avg),
      level: heatLevel(avg, [25, 35, 45]),
      href: "/vyron-core/command-centre",
    });
  }

  return cells;
}

function buildAttritionForecast(twins: WorkforceTwinRow[]): TrendPoint[] {
  const months = lastNMonthsLabels(6);
  const baseRate = twins.length
    ? (twins.reduce((s, t) => s + t.attritionProbability, 0) / twins.length) * 100
    : 12;
  return months.map((m, i) => ({
    label: m.label,
    value: round2(baseRate + i * 0.4 + (i % 2 === 0 ? 0.8 : -0.3)),
  }));
}

function buildTrends(modules: WorkforceModuleBundle): VyronCoreCommandCentrePayload["trends"] {
  const labourCostTrend = lastNMonthsLabels(6).map((m, i) => ({
    ...m,
    value: round2(modules.costIntelligence.labourCostMonth * (0.94 + i * 0.012)),
  }));
  const productivityTrend = lastNMonthsLabels(6).map((m, i) => ({
    ...m,
    value: round2(78 + i * 1.2 + modules.clocking.onTimeRate * 0.05),
  }));
  const healthTrend = lastNMonthsLabels(6).map((m, i) => ({
    ...m,
    value: round2(74 + i * 1.5),
  }));
  const leakageTrend = lastNMonthsLabels(6).map((m, i) => ({
    ...m,
    value: round2(modules.riskIntelligence.predictedLeakage * (1.05 - i * 0.02)),
  }));
  return { labourCostTrend, productivityTrend, healthTrend, leakageTrend };
}

function buildAiExecutiveSummary(
  modules: WorkforceModuleBundle,
  twins: WorkforceTwinRow[],
  headline: VyronCoreCommandCentrePayload["headline"]
): VyronCoreCommandCentrePayload["aiExecutiveSummary"] {
  const highAttrition = twins.filter((t) => t.attritionProbability >= 0.2);
  const bullets = [
    `Labour cost at R${headline.labourCost.toLocaleString("en-ZA")} — ${modules.costIntelligence.costVariancePct}% vs budget.`,
    `Productivity index ${headline.productivity}% with ${modules.clocking.onTimeRate}% on-time clocking.`,
    `Workforce health score ${headline.workforceHealth}/100 across ${twins.length} digital twin profiles.`,
    `Predicted workforce leakage R${headline.predictedLeakage.toLocaleString("en-ZA")} from overtime, travel and field gaps.`,
  ];
  if (highAttrition.length) {
    bullets.push(`${highAttrition.length} employee(s) above 20% attrition risk — review retention in Field Sales and Field Service.`);
  }

  const insights: AiFeedItem[] = [
    {
      id: "wf-1",
      severity: modules.riskIntelligence.complianceFlags > 5 ? "high" : "medium",
      category: "Risk Intelligence",
      title: "Compliance exposure",
      message: `${modules.riskIntelligence.complianceFlags} workforce compliance flags — clocking and travel policy review recommended.`,
      href: "/risk-centre",
    },
    {
      id: "wf-2",
      severity: modules.travelIntelligence.policyBreaches > 3 ? "medium" : "low",
      category: "Travel Intelligence",
      title: "Travel efficiency",
      message: `Route efficiency ${modules.travelIntelligence.routeEfficiencyScore}% — idle travel at ${modules.travelIntelligence.idleTravelPct}%.`,
      href: "/vyron-core/forecasting",
    },
    {
      id: "wf-3",
      severity: modules.fieldOperations.completionRate < 90 ? "high" : "low",
      category: "Field Operations",
      title: "Field completion",
      message: `${modules.fieldOperations.visitsCompleted}/${modules.fieldOperations.visitsScheduled} visits completed (${modules.fieldOperations.completionRate}%).`,
      href: "/vyron-core/command-centre",
    },
    {
      id: "wf-4",
      severity: modules.costIntelligence.overtimeCost > 35000 ? "medium" : "low",
      category: "Cost Intelligence",
      title: "Overtime pressure",
      message: `Overtime cost R${modules.costIntelligence.overtimeCost.toLocaleString("en-ZA")} this month — simulation available.`,
      href: "/vyron-core/simulations",
    },
    {
      id: "wf-5",
      severity: "medium",
      category: "Clocking",
      title: "Attendance pattern",
      message: `${modules.clocking.lateArrivals} late arrivals and ${modules.clocking.missedClockOuts} missed clock-outs detected.`,
      href: "/vyron-core/command-centre",
    },
  ];

  const summary = `VYRON CORE workforce twin shows ${headline.workforceHealth}/100 health with R${headline.predictedLeakage.toLocaleString("en-ZA")} predicted leakage. Clocking, field ops, travel and cost signals are integrated — ${insights.filter((i) => i.severity === "high").length} high-priority items need executive attention.`;

  return { summary, bullets, insights };
}

export async function getVyronCoreCommandCentreData(
  supabase: SupabaseClient | null,
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<VyronCoreCommandCentrePayload> {
  const [twins, forecasts, simulations, healthScores, leakage, mfgStats] = await Promise.all([
    loadTwins(supabase, companyId),
    loadForecasts(supabase, companyId),
    loadSimulations(supabase, companyId),
    loadHealthScores(supabase, companyId),
    getFinancialLeakageDashboard().catch(() => null),
    supabase ? getManufacturingDashboardStats(supabase, companyId).catch(() => null) : Promise.resolve(null),
  ]);

  const modules = buildWorkforceModuleBundle({
    costIntelligence: {
      labourCostMonth: mfgStats?.productionCost ? mfgStats.productionCost * 0.42 : 428500,
      labourCostBudget: 445000,
      costPerUnit: mfgStats?.productionThisMonth ? mfgStats.productionCost / Math.max(mfgStats.productionThisMonth, 1) : 18.6,
      overtimeCost: 38400,
      agencyCost: 22100,
      costVariancePct: -3.7,
    },
    riskIntelligence: {
      overallRiskScore: 34,
      complianceFlags: 7,
      safetyIncidents: 1,
      contractExpiryRisk: 3,
      skillsGapRisk: 5,
      predictedLeakage: leakage?.estimatedMonthlyLeakage ? Math.round(leakage.estimatedMonthlyLeakage * 0.18) : 67200,
    },
  });

  const avgProductivity = twins.length
    ? round2(twins.reduce((s, t) => s + t.productivityIndex, 0) / twins.length)
    : 86;
  const avgHealth = healthScores.length
    ? round2(healthScores.reduce((s, h) => s + h.score, 0) / healthScores.length)
    : round2(twins.reduce((s, t) => s + t.healthScore, 0) / Math.max(twins.length, 1));

  const headline = {
    labourCost: modules.costIntelligence.labourCostMonth,
    productivity: avgProductivity,
    workforceHealth: avgHealth,
    risk: modules.riskIntelligence.overallRiskScore,
    predictedLeakage: modules.riskIntelligence.predictedLeakage,
  };

  return {
    headline,
    modules,
    twins,
    heatmap: buildHeatmap(modules, twins),
    forecasts,
    simulations,
    healthScores,
    attritionForecast: buildAttritionForecast(twins),
    trends: buildTrends(modules),
    aiExecutiveSummary: buildAiExecutiveSummary(modules, twins, headline),
  };
}

export type SimulationInput = {
  scenarioName: string;
  scenarioType: "headcount" | "overtime" | "attrition" | "field_coverage" | "travel_reduction";
  params: Record<string, number>;
};

export function runWorkforceSimulation(input: SimulationInput) {
  const { scenarioType, params } = input;
  let output: Record<string, number> = {};

  switch (scenarioType) {
    case "overtime": {
      const reduction = params.overtimeReductionPct || 10;
      output = {
        labourCostSaving: round2(38400 * (reduction / 100)),
        productivityImpact: round2(-reduction * 0.08),
        riskDelta: round2(-reduction * 0.12),
      };
      break;
    }
    case "headcount": {
      const delta = params.headcountDelta || 2;
      output = {
        labourCostDelta: round2(delta * 18500),
        productivityImpact: round2(delta * 2.5),
        coverageDelta: round2(delta * 4),
      };
      break;
    }
    case "attrition": {
      const rate = params.attritionRatePct || 8;
      output = {
        replacementCost: round2(rate * 4200),
        knowledgeLossRisk: round2(rate * 1.8),
        leakageExposure: round2(rate * 2800),
      };
      break;
    }
    case "field_coverage": {
      const reps = params.additionalReps || 1;
      output = {
        visitCompletionDelta: round2(reps * 4.2),
        labourCostDelta: round2(reps * 14200),
        leakageReduction: round2(reps * 6200),
      };
      break;
    }
    case "travel_reduction": {
      const pct = params.travelReductionPct || 10;
      output = {
        kmSaved: round2(4820 * (pct / 100)),
        claimSaving: round2(28640 * (pct / 100)),
        efficiencyGain: round2(pct * 0.6),
      };
      break;
    }
    default:
      output = { note: 0 };
  }

  return {
    scenarioName: input.scenarioName,
    scenarioType: input.scenarioType,
    inputParams: params,
    outputResults: output,
    status: "completed" as const,
  };
}

export async function saveWorkforceSimulation(
  supabase: SupabaseClient | null,
  companyId: string,
  result: ReturnType<typeof runWorkforceSimulation>
): Promise<WorkforceSimulationRow> {
  const row = {
    company_id: companyId,
    scenario_name: result.scenarioName,
    scenario_type: result.scenarioType,
    input_params: result.inputParams,
    output_results: result.outputResults,
    status: result.status,
  };

  if (supabase) {
    const { data, error } = await supabase.from("workforce_simulations").insert(row).select("*").single();
    if (!error && data) {
      return {
        id: String(data.id),
        scenarioName: String(data.scenario_name),
        scenarioType: String(data.scenario_type),
        inputParams: (data.input_params || {}) as Record<string, unknown>,
        outputResults: (data.output_results || {}) as Record<string, unknown>,
        status: String(data.status),
        createdAt: String(data.created_at),
      };
    }
  }

  return {
    id: `sim-${Date.now()}`,
    scenarioName: result.scenarioName,
    scenarioType: result.scenarioType,
    inputParams: result.inputParams,
    outputResults: result.outputResults,
    status: result.status,
    createdAt: new Date().toISOString(),
  };
}
