import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeActionsSnapshot,
  type ActionsInput,
} from "@/lib/vyron-actions";
import { computeAutonomousCommandSnapshot } from "@/lib/vyron-autonomous-command";
import { computeBusinessHealthSnapshot } from "@/lib/vyron-business-health";
import {
  computeDecisionsSnapshot,
  type DecisionConfidence,
} from "@/lib/vyron-decisions";
import {
  computeEarlyWarningSnapshot,
  type RecipeQualityStats,
} from "@/lib/vyron-early-warning";
import { computePredictiveRiskSnapshot } from "@/lib/vyron-predictive-risk";
import { computeRootCauseSnapshot } from "@/lib/vyron-root-cause";
import { listRecipes, type RecipeRecord } from "@/lib/vyron-cost-recipes-data";
import { listCustomerInvoices } from "@/lib/vyron-customer-invoices";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { readConnection } from "@/lib/vyron-xero-connection-store";
import { listXeroSyncQueueRows } from "@/lib/vyron-xero-integration";
import { readXeroWorkspaceSettings } from "@/lib/vyron-xero-mapping";
import type { XeroConnectionState } from "@/lib/vyron-xero-integration";

export type AskVyronCategory =
  | "margin"
  | "supplier"
  | "inventory"
  | "xero"
  | "warnings"
  | "predictive-risk"
  | "root-cause"
  | "decisions"
  | "actions"
  | "business-health"
  | "executive-summary"
  | "unknown";

export type AskVyronEvidence = {
  label: string;
  value: string;
};

export type AskVyronDrilldown = {
  label: string;
  href: string;
};

export type AskVyronAnswer = {
  answer: string;
  summary: string;
  confidence: DecisionConfidence;
  evidence: AskVyronEvidence[];
  relatedRisks: string[];
  recommendedActions: string[];
  drilldowns: AskVyronDrilldown[];
  sourceModules: string[];
  category: AskVyronCategory;
  insufficientData?: boolean;
};

export type IntelligenceSourceStatus = {
  id: string;
  label: string;
  status: string;
  signalCount: number;
  href: string;
  available: boolean;
};

export type SuggestedQuestionGroup = {
  id: string;
  label: string;
  questions: string[];
};

export type AskVyronContext = {
  hasWorkspace: boolean;
  companyName: string;
  input: ActionsInput | null;
};

export const SUGGESTED_QUESTION_GROUPS: SuggestedQuestionGroup[] = [
  {
    id: "margin",
    label: "Margin",
    questions: [
      "What is hurting my margin?",
      "Which products need repricing?",
      "Where is my biggest margin exposure?",
    ],
  },
  {
    id: "supplier",
    label: "Suppliers",
    questions: [
      "Which suppliers are creating risk?",
      "Where is supplier inflation hitting us?",
      "What supplier actions should we take?",
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    questions: [
      "What inventory risks should we address?",
      "Which stock issues need attention?",
    ],
  },
  {
    id: "xero",
    label: "Xero",
    questions: [
      "Is Xero connected and healthy?",
      "What Xero blockers exist?",
    ],
  },
  {
    id: "decisions",
    label: "Executive decisions",
    questions: [
      "What decisions should management make?",
      "What should we fix first?",
      "Why is my business health low?",
    ],
  },
  {
    id: "actions",
    label: "Actions",
    questions: [
      "What actions are ready to execute?",
      "What must be done first?",
      "What are my top warnings?",
    ],
  },
];

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function computeRecipeQuality(recipes: RecipeRecord[]): RecipeQualityStats {
  const totalRecipes = recipes.length;
  const recipesWithoutLines = recipes.filter((row) => !row.lines?.length).length;
  const recipesWithoutCosting = recipes.filter((row) => !Number(row.total_cost)).length;
  return { totalRecipes, recipesWithoutLines, recipesWithoutCosting };
}

function computeInvoiceSummary(
  invoices: Array<{
    status?: string;
    stock_posted?: boolean;
    invoice_date?: string;
    customer_id?: string | null;
    customer_name?: string;
    sales_value?: number;
    gross_profit?: number;
  }>
) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const posted = invoices.filter((inv) => {
    const status = String(inv.status || "");
    const postedStatus = inv.stock_posted || ["Posted", "Sent", "Paid"].includes(status);
    if (!postedStatus || !inv.invoice_date) return false;
    return new Date(inv.invoice_date) >= monthStart;
  });

  const monthlySales = posted.reduce((sum, inv) => sum + Number(inv.sales_value || 0), 0);
  const gpWeighted = posted.reduce(
    (acc, inv) => {
      const sales = Number(inv.sales_value || 0);
      return { sales: acc.sales + sales, gp: acc.gp + Number(inv.gross_profit || 0) };
    },
    { sales: 0, gp: 0 }
  );
  const uniqueCustomers = new Set(
    posted.map((inv) => String(inv.customer_id || inv.customer_name || ""))
  ).size;

  return {
    monthlySales,
    monthlyGpPct: gpWeighted.sales > 0 ? (gpWeighted.gp / gpWeighted.sales) * 100 : 0,
    invoiceCount: posted.length,
    uniqueCustomers,
  };
}

export async function loadAskVyronContext(): Promise<AskVyronContext> {
  const workspace = await getServerActiveWorkspace();
  const companyId = await getWorkspaceCompanyId();
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  if (!workspace?.id || !companyId) {
    return { hasWorkspace: false, companyName, input: null };
  }

  const supabase: SupabaseClient | null = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const intelligence = await getTenantCostIntelligence(companyId);
  const commandData = supabase ? await getExecutiveCommandCentreData(supabase, companyId) : null;
  const xeroConnection: XeroConnectionState = await readConnection(workspace.id);
  const xeroSettings = await readXeroWorkspaceSettings(workspace.id);
  const invoiceSyncReady = Boolean(
    xeroSettings.accounts.salesAccount?.trim() && xeroSettings.accounts.vatStandard?.trim()
  );

  let xeroQueueFailed = 0;
  let xeroQueueReady = 0;
  let recipeQuality: RecipeQualityStats | null = null;
  let invoiceSummary: ReturnType<typeof computeInvoiceSummary> | null = null;

  if (supabase) {
    const [queueRows, recipes, invoices] = await Promise.all([
      listXeroSyncQueueRows(supabase, companyId),
      listRecipes(supabase, companyId).catch(() => [] as RecipeRecord[]),
      listCustomerInvoices(supabase, companyId).catch(() => []),
    ]);

    xeroQueueFailed = queueRows.filter((row) => String(row.status) === "Failed").length;
    xeroQueueReady = queueRows.filter((row) => String(row.status) === "Ready").length;
    recipeQuality = computeRecipeQuality(recipes);
    invoiceSummary = computeInvoiceSummary(invoices);
  }

  return {
    hasWorkspace: true,
    companyName,
    input: {
      intelligence,
      commandData,
      xeroConnection,
      invoiceSummary,
      invoiceSyncReady,
      xeroQueueFailed,
      xeroQueueReady,
      recipeQuality,
    },
  };
}

export function classifyAskVyronQuestion(question: string): AskVyronCategory {
  const q = question.toLowerCase().trim();
  if (!q) return "unknown";

  if (/\bxero\b|accounting sync|mapping incomplete|financial visibility/.test(q)) return "xero";
  if (/margin|gp\b|gross profit|repric|pricing|hurting.*margin|below.*target/.test(q)) return "margin";
  if (/supplier|procurement|inflation|vendor/.test(q)) return "supplier";
  if (/inventory|stock|slow.?moving|overstock|warehouse/.test(q)) return "inventory";
  if (/warning|early warning|alert/.test(q)) return "warnings";
  if (/predict|forecast|future risk/.test(q)) return "predictive-risk";
  if (/root cause|why is|why are|underlying cause/.test(q)) return "root-cause";
  if (/decision|management make|should we/.test(q)) return "decisions";
  if (/action|execute|ready to|do first|do next|must be done|top action/.test(q)) return "actions";
  if (/business health|health score|health low|why.*low/.test(q)) return "business-health";
  if (/exposure|overview|happening|executive summary|biggest/.test(q)) return "executive-summary";

  return "unknown";
}

function insufficientDataAnswer(category: AskVyronCategory): AskVyronAnswer {
  return {
    answer: "VYRON needs more operational data to answer this properly.",
    summary:
      "Load products, BOMs, suppliers, inventory movements, customer invoices or connect Xero so intelligence engines can produce evidence-backed answers.",
    confidence: "Low",
    evidence: [],
    relatedRisks: [],
    recommendedActions: [
      "Create products with selling prices, costs and target GP",
      "Build recipes / BOMs with ingredient costs",
      "Import suppliers and process purchase orders",
      "Post customer invoices",
      "Connect and map Xero accounts",
    ],
    drilldowns: [
      { label: "Products", href: "/products" },
      { label: "Recipes & BOM", href: "/recipes" },
      { label: "Suppliers", href: "/suppliers" },
      { label: "Customer invoices", href: "/customer-invoices" },
      { label: "Xero integration", href: "/integrations/xero" },
    ],
    sourceModules: ["Setup guidance"],
    category,
    insufficientData: true,
  };
}

function unknownAnswer(): AskVyronAnswer {
  return {
    answer:
      "I can answer best when the question relates to cost, margin, suppliers, inventory, invoices, Xero, risks, decisions or actions.",
    summary:
      "Try asking about margin erosion, supplier risk, top warnings, root causes, executive decisions, ready actions, business health or Xero status.",
    confidence: "High",
    evidence: [],
    relatedRisks: [],
    recommendedActions: SUGGESTED_QUESTION_GROUPS.flatMap((group) => group.questions.slice(0, 1)),
    drilldowns: [
      { label: "Autonomous Command Centre", href: "/autonomous-command-centre" },
      { label: "Cost Intelligence", href: "/cost-intelligence" },
      { label: "Business Health", href: "/business-health" },
    ],
    sourceModules: ["Ask VYRON guidance"],
    category: "unknown",
  };
}

function buildMarginAnswer(input: ActionsInput): AskVyronAnswer {
  const intelligence = input.intelligence;
  const earlyWarning = computeEarlyWarningSnapshot(input);
  const decisions = computeDecisionsSnapshot(input);
  const marginWarnings = earlyWarning.warnings.filter((row) => row.category === "Margin");
  const erosion = intelligence?.marginErosion ?? [];
  const repricing = intelligence?.repricingSuggestions ?? [];
  const belowGp = (intelligence?.products ?? []).filter((row) => Number(row.gp_gap ?? 0) < 0);

  if (!intelligence?.products.length && !marginWarnings.length) {
    return insufficientDataAnswer("margin");
  }

  const evidence: AskVyronEvidence[] = [];
  if (input.invoiceSummary && input.invoiceSummary.invoiceCount > 0) {
    evidence.push({
      label: "Month GP",
      value: `${input.invoiceSummary.monthlyGpPct.toFixed(1)}% on ${money(input.invoiceSummary.monthlySales)} posted sales`,
    });
  }
  if (belowGp.length > 0) {
    evidence.push({
      label: "Below-target GP products",
      value: `${belowGp.length} product(s) — e.g. ${belowGp[0].product_name}`,
    });
  }
  if (erosion.length > 0) {
    evidence.push({
      label: "Margin erosion signals",
      value: `${erosion.length} product(s) with measurable erosion`,
    });
  }
  marginWarnings.slice(0, 3).forEach((row) => {
    evidence.push({ label: row.severity, value: row.title });
  });

  const recoveryMonthly = intelligence?.summary.recoveryMonthly ?? 0;
  const answer =
    belowGp.length > 0
      ? `${belowGp.length} product(s) are below target GP. ${marginWarnings.length ? `${marginWarnings.length} margin warning(s) are active.` : ""} Repricing and cost recovery are the primary levers.`
      : marginWarnings.length > 0
        ? `Margin pressure is flagged through ${marginWarnings.length} early warning signal(s). Review product costs, selling prices and BOM structures.`
        : "Available margin signals are limited, but cost intelligence is monitoring product GP positions.";

  return {
    answer,
    summary:
      recoveryMonthly > 0
        ? `Estimated recovery opportunity on record: ${money(recoveryMonthly)}/month from cost intelligence.`
        : repricing.length > 0
          ? `${repricing.length} repricing suggestion(s) available from product margin intelligence.`
          : "Review product margins and repricing suggestions in Cost Intelligence.",
    confidence: evidence.length >= 3 ? "High" : evidence.length >= 1 ? "Medium" : "Low",
    evidence,
    relatedRisks: marginWarnings.slice(0, 5).map((row) => row.title),
    recommendedActions: [
      ...repricing.slice(0, 2).map((row) => `Review repricing for ${row.productName}`),
      ...decisions.recommendedDecisions
        .filter((row) => row.category === "Pricing")
        .slice(0, 2)
        .map((row) => row.decision),
      ...marginWarnings.slice(0, 2).map((row) => row.recommendedAction),
    ].filter(Boolean),
    drilldowns: [
      { label: "Cost Intelligence", href: "/cost-intelligence" },
      { label: "Product margins", href: "/reports/product-margins" },
      { label: "Products", href: "/products" },
      { label: "Early Warning", href: "/early-warning" },
    ],
    sourceModules: ["Cost Intelligence", "Early Warning", "Decisions"],
    category: "margin",
  };
}

function buildSupplierAnswer(input: ActionsInput): AskVyronAnswer {
  const intelligence = input.intelligence;
  const earlyWarning = computeEarlyWarningSnapshot(input);
  const rootCause = computeRootCauseSnapshot(input);
  const supplierWarnings = earlyWarning.warnings.filter(
    (row) => row.category === "Supplier" || row.category === "Procurement"
  );
  const inflation = intelligence?.supplierInflation ?? [];
  const supplierCauses = rootCause.investigations.filter(
    (row) => row.category === "Supplier" || row.category === "Procurement"
  );

  if (!inflation.length && !supplierWarnings.length && !supplierCauses.length) {
    return insufficientDataAnswer("supplier");
  }

  const exposure = inflation.reduce((sum, row) => sum + Number(row.monthlyExposure || 0), 0);
  const evidence: AskVyronEvidence[] = inflation.slice(0, 4).map((row) => ({
    label: row.supplierName,
    value: `${row.movementPct.toFixed(1)}% movement · ${money(row.monthlyExposure)}/month · ${row.riskLevel} risk`,
  }));
  supplierWarnings.slice(0, 2).forEach((row) => {
    evidence.push({ label: "Warning", value: row.title });
  });

  const top = inflation[0];
  const answer = top
    ? `${top.supplierName} is the highest recorded supplier inflation signal (${top.movementPct.toFixed(1)}% movement, ${money(top.monthlyExposure)}/month exposure). ${supplierWarnings.length ? `${supplierWarnings.length} supplier/procurement warning(s) are active.` : ""}`
    : supplierWarnings.length > 0
      ? `${supplierWarnings.length} supplier or procurement warning(s) require review.`
      : "Supplier root cause investigations indicate procurement risk on record.";

  return {
    answer,
    summary:
      exposure > 0
        ? `Total addressable supplier inflation exposure: ${money(exposure)}/month across ${inflation.length} supplier signal(s).`
        : "Review supplier intelligence and purchase order variance for negotiation priorities.",
    confidence: inflation.length >= 2 || supplierWarnings.length > 0 ? "High" : "Medium",
    evidence,
    relatedRisks: [
      ...supplierWarnings.slice(0, 3).map((row) => row.title),
      ...supplierCauses.slice(0, 2).map((row) => row.problem),
    ],
    recommendedActions: [
      ...supplierWarnings.slice(0, 2).map((row) => row.recommendedAction),
      ...rootCause.correctiveActions
        .filter((row) => row.rootCause.toLowerCase().includes("supplier"))
        .slice(0, 2)
        .map((row) => row.action),
    ].filter(Boolean),
    drilldowns: [
      { label: "Suppliers", href: "/suppliers" },
      { label: "Purchase orders", href: "/purchase-orders" },
      { label: "Root Cause Centre", href: "/root-cause" },
    ],
    sourceModules: ["Cost Intelligence", "Early Warning", "Root Cause"],
    category: "supplier",
  };
}

function buildInventoryAnswer(input: ActionsInput): AskVyronAnswer {
  const earlyWarning = computeEarlyWarningSnapshot(input);
  const rootCause = computeRootCauseSnapshot(input);
  const actions = computeActionsSnapshot(input);
  const inventoryWarnings = earlyWarning.warnings.filter((row) => row.category === "Inventory");
  const inventoryActions = actions.pipeline.filter((row) => row.category === "Inventory");

  if (!inventoryWarnings.length && !rootCause.clusters.find((row) => row.label === "Inventory Issues")?.problemCount) {
    return insufficientDataAnswer("inventory");
  }

  const cluster = rootCause.clusters.find((row) => row.label === "Inventory Issues");
  const evidence: AskVyronEvidence[] = inventoryWarnings.slice(0, 4).map((row) => ({
    label: row.severity,
    value: row.title,
  }));
  if (cluster && cluster.problemCount > 0) {
    evidence.push({
      label: "Root cause cluster",
      value: `${cluster.problemCount} inventory issue(s) · ${cluster.exposureLabel}`,
    });
  }

  return {
    answer: `${inventoryWarnings.length} inventory warning(s) are active. ${cluster?.problemCount ? `${cluster.problemCount} inventory root cause investigation(s) are on record.` : ""}`,
    summary: cluster?.exposure
      ? `Inventory exposure flagged: ${cluster.exposureLabel}.`
      : "Review slow-moving, low-stock and negative stock signals in inventory intelligence.",
    confidence: inventoryWarnings.length >= 2 ? "High" : "Medium",
    evidence,
    relatedRisks: inventoryWarnings.slice(0, 5).map((row) => row.title),
    recommendedActions: [
      ...inventoryWarnings.slice(0, 3).map((row) => row.recommendedAction),
      ...inventoryActions.slice(0, 2).map((row) => row.action),
    ],
    drilldowns: [
      { label: "Inventory stock", href: "/inventory/stock" },
      { label: "Early Warning", href: "/early-warning" },
      { label: "Actions Centre", href: "/actions" },
    ],
    sourceModules: ["Early Warning", "Root Cause", "Actions"],
    category: "inventory",
  };
}

function buildXeroAnswer(input: ActionsInput): AskVyronAnswer {
  const earlyWarning = computeEarlyWarningSnapshot(input);
  const xeroWarnings = earlyWarning.warnings.filter((row) => row.category === "Xero");
  const connection = input.xeroConnection;

  if (!connection) {
    return insufficientDataAnswer("xero");
  }

  const evidence: AskVyronEvidence[] = [
    { label: "Connection status", value: connection.status || "Not Connected" },
    { label: "Connected", value: connection.connected ? "Yes" : "No" },
  ];
  if (connection.pendingOrganisationSelection) {
    evidence.push({ label: "Organisation", value: "Pending organisation selection" });
  }
  evidence.push({ label: "Invoice mapping ready", value: input.invoiceSyncReady ? "Yes" : "No" });
  if (input.xeroQueueFailed > 0) {
    evidence.push({ label: "Sync failures", value: String(input.xeroQueueFailed) });
  }
  if (input.xeroQueueReady > 0) {
    evidence.push({ label: "Sync queue ready", value: String(input.xeroQueueReady) });
  }

  const healthy =
    connection.connected &&
    connection.status !== "Token Expired" &&
    input.invoiceSyncReady &&
    input.xeroQueueFailed === 0;

  const answer = healthy
    ? "Xero is connected and mapping appears ready. Sync health is being monitored from workspace records."
    : !connection.connected
      ? `Xero is not connected (status: ${connection.status || "Not Connected"}). Financial visibility is limited until integration is restored.`
      : !input.invoiceSyncReady
        ? "Xero is connected but invoice account mapping is incomplete. Accounting sync may be blocked."
        : input.xeroQueueFailed > 0
          ? `Xero is connected but ${input.xeroQueueFailed} sync failure(s) are on record.`
          : "Xero connection needs attention — review integration status and mapping.";

  return {
    answer,
    summary: healthy
      ? "Accounting integration health is acceptable on available signals."
      : "Resolve connection, mapping or sync failures to restore financial visibility.",
    confidence: connection.connected ? "High" : "Medium",
    evidence,
    relatedRisks: xeroWarnings.slice(0, 4).map((row) => row.title),
    recommendedActions: xeroWarnings.slice(0, 3).map((row) => row.recommendedAction),
    drilldowns: [
      { label: "Xero integration", href: "/integrations/xero" },
      { label: "Xero sync centre", href: "/integrations/xero/sync-centre" },
      { label: "Early Warning", href: "/early-warning" },
    ],
    sourceModules: ["Xero", "Early Warning"],
    category: "xero",
  };
}

function buildWarningsAnswer(input: ActionsInput): AskVyronAnswer {
  const earlyWarning = computeEarlyWarningSnapshot(input);
  if (!earlyWarning.hasMonitoringData) return insufficientDataAnswer("warnings");

  const top = earlyWarning.topRisks.slice(0, 5);
  const evidence: AskVyronEvidence[] = [
    { label: "Critical", value: String(earlyWarning.summary.critical) },
    { label: "High", value: String(earlyWarning.summary.high) },
    { label: "Potential exposure", value: earlyWarning.summary.exposureLabel },
    ...top.slice(0, 3).map((row) => ({ label: row.severity, value: row.risk })),
  ];

  return {
    answer: `${earlyWarning.summary.critical} critical and ${earlyWarning.summary.high} high warnings are active across monitored domains.`,
    summary: top[0]
      ? `Highest priority warning: ${top[0].risk}`
      : "Review Early Warning Centre for category breakdown.",
    confidence: top.length >= 2 ? "High" : "Medium",
    evidence,
    relatedRisks: top.map((row) => row.risk),
    recommendedActions: top.map((row) => row.recommendedResponse),
    drilldowns: [
      { label: "Early Warning Centre", href: "/early-warning" },
      { label: "Autonomous Command Centre", href: "/autonomous-command-centre" },
    ],
    sourceModules: ["Early Warning"],
    category: "warnings",
  };
}

function buildPredictiveRiskAnswer(input: ActionsInput): AskVyronAnswer {
  const predictive = computePredictiveRiskSnapshot(input);
  if (!predictive.hasForecastData) return insufficientDataAnswer("predictive-risk");

  const top = predictive.topFutureRisks.slice(0, 5);
  const evidence: AskVyronEvidence[] = [
    { label: "Critical forecast risks", value: String(predictive.summary.criticalForecastRisks) },
    { label: "Forecast horizon", value: predictive.summary.forecastHorizon },
    { label: "Outlook", value: predictive.summary.outlookLabel },
    ...top.slice(0, 3).map((row) => ({ label: row.severity, value: row.risk })),
  ];

  return {
    answer: `${predictive.summary.criticalForecastRisks} critical and ${predictive.summary.highForecastRisks} high forecast risks are projected over ${predictive.summary.forecastHorizon}.`,
    summary: top[0] ? `Leading forecast risk: ${top[0].risk}` : predictive.summary.forecastExposureLabel,
    confidence: predictive.summary.confidenceLevel,
    evidence,
    relatedRisks: top.map((row) => row.risk),
    recommendedActions: predictive.preventiveActions.slice(0, 4).map((row) => row.title),
    drilldowns: [
      { label: "Predictive Risk Centre", href: "/predictive-risk" },
      { label: "Early Warning", href: "/early-warning" },
    ],
    sourceModules: ["Predictive Risk", "Early Warning"],
    category: "predictive-risk",
  };
}

function buildRootCauseAnswer(input: ActionsInput): AskVyronAnswer {
  const rootCause = computeRootCauseSnapshot(input);
  if (!rootCause.hasAnalysisData) return insufficientDataAnswer("root-cause");

  const top = rootCause.investigations.slice(0, 5);
  const evidence: AskVyronEvidence[] = [
    { label: "Critical root causes", value: String(rootCause.summary.criticalRootCauses) },
    { label: "Categories affected", value: String(rootCause.summary.categoriesAffected) },
    { label: "Exposure", value: rootCause.summary.exposureLabel },
    ...top.slice(0, 3).map((row) => ({ label: row.severity, value: row.problem })),
  ];

  return {
    answer: `${rootCause.investigations.length} root cause investigation(s) are on record. ${rootCause.summary.criticalRootCauses} are classified critical.`,
    summary: top[0] ? `Primary problem: ${top[0].problem} — root cause: ${top[0].rootCause}` : "Review Root Cause Centre for evidence trees.",
    confidence: rootCause.summary.confidenceLevel,
    evidence,
    relatedRisks: top.map((row) => row.problem),
    recommendedActions: rootCause.correctiveActions.slice(0, 4).map((row) => row.action),
    drilldowns: [
      { label: "Root Cause Centre", href: "/root-cause" },
      { label: "Decisions Centre", href: "/decisions" },
    ],
    sourceModules: ["Root Cause", "Early Warning", "Predictive Risk"],
    category: "root-cause",
  };
}

function buildDecisionsAnswer(input: ActionsInput): AskVyronAnswer {
  const decisions = computeDecisionsSnapshot(input);
  if (!decisions.hasDecisionData) return insufficientDataAnswer("decisions");

  const top = decisions.recommendedDecisions.slice(0, 5);
  const evidence: AskVyronEvidence[] = [
    { label: "Critical decisions", value: String(decisions.summary.criticalDecisions) },
    { label: "Opportunity", value: decisions.summary.opportunityLabel },
    { label: "Risk reduction", value: decisions.summary.riskReductionLabel },
    ...top.slice(0, 3).map((row) => ({ label: row.urgency, value: row.decision })),
  ];

  return {
    answer: `${decisions.recommendedDecisions.length} executive decision(s) are recommended. ${decisions.summary.criticalDecisions} require immediate attention.`,
    summary: top[0] ? `Top decision: ${top[0].decision}` : "Review Decisions Centre for ranked recommendations.",
    confidence: decisions.summary.confidenceLevel,
    evidence,
    relatedRisks: top.map((row) => row.whyRecommended),
    recommendedActions: top.map((row) => row.decision),
    drilldowns: [
      { label: "Decisions Centre", href: "/decisions" },
      { label: "Actions Centre", href: "/actions" },
    ],
    sourceModules: ["Decisions", "Root Cause"],
    category: "decisions",
  };
}

function buildActionsAnswer(input: ActionsInput): AskVyronAnswer {
  const actions = computeActionsSnapshot(input);
  if (!actions.hasActionData) return insufficientDataAnswer("actions");

  const ready = actions.pipeline.filter((row) => row.status === "Ready");
  const top = actions.executionQueue.slice(0, 5);
  const evidence: AskVyronEvidence[] = [
    { label: "Total actions", value: String(actions.pipeline.length) },
    { label: "Ready to execute", value: String(ready.length) },
    { label: "Blocked", value: String(actions.pipeline.filter((row) => row.status === "Blocked").length) },
    { label: "Execution readiness", value: actions.summary.executionReadiness },
    ...top.slice(0, 3).map((row) => ({ label: row.priority, value: row.action })),
  ];

  const first = top[0] || ready[0] || actions.pipeline[0];
  return {
    answer: first
      ? `${ready.length} action(s) are ready to execute. Highest priority item: ${first.action}.`
      : "Actions are on record but none are currently marked ready.",
    summary: `Execution readiness: ${actions.summary.executionReadiness}. ${actions.summary.criticalActions} critical action(s) in pipeline.`,
    confidence: ready.length > 0 ? "High" : "Medium",
    evidence,
    relatedRisks: actions.blockers.slice(0, 3).map((row) => row.blocker),
    recommendedActions: top.map((row) => row.action),
    drilldowns: [
      { label: "Actions Centre", href: "/actions" },
      { label: "Autonomous Command Centre", href: "/autonomous-command-centre" },
    ],
    sourceModules: ["Actions", "Decisions"],
    category: "actions",
  };
}

function buildBusinessHealthAnswer(input: ActionsInput): AskVyronAnswer {
  const health = computeBusinessHealthSnapshot(input);
  if (health.scoredCategoryCount === 0 && health.overallScore == null) {
    return insufficientDataAnswer("business-health");
  }

  const weak = health.categories.filter(
    (row) => row.status === "Critical" || row.status === "Risk" || row.status === "Watch"
  );
  const evidence: AskVyronEvidence[] = [
    {
      label: "Overall score",
      value: health.overallScore != null ? `${health.overallScore}/100 · ${health.overallStatus}` : health.overallStatus,
    },
    { label: "Trend", value: health.trend },
    ...weak.slice(0, 4).map((row) => ({
      label: row.label,
      value: `${row.status}${row.score != null ? ` · ${row.score}/100` : ""} — ${row.keyIssue}`,
    })),
  ];

  const answer =
    health.overallScore != null
      ? `Business health is ${health.overallStatus} at ${health.overallScore}/100. ${weak.length ? `${weak.length} category(ies) are below healthy thresholds.` : "All scored categories are within acceptable ranges."}`
      : `Business health status is ${health.overallStatus}. Additional operational data will improve scoring confidence.`;

  return {
    answer,
    summary: weak[0] ? `Primary drag: ${weak[0].label} — ${weak[0].keyIssue}` : health.topRisks[0]?.detail || "Review Business Health Centre for category scores.",
    confidence: health.scoredCategoryCount >= 3 ? "High" : "Medium",
    evidence,
    relatedRisks: health.topRisks.slice(0, 4).map((row) => row.title),
    recommendedActions: health.actions.slice(0, 4).map((row) => row.title),
    drilldowns: [
      { label: "Business Health Centre", href: "/business-health" },
      { label: "Early Warning", href: "/early-warning" },
    ],
    sourceModules: ["Business Health", "Executive Boardroom"],
    category: "business-health",
  };
}

function buildExecutiveSummaryAnswer(input: ActionsInput): AskVyronAnswer {
  const command = computeAutonomousCommandSnapshot(input);
  if (!command.hasCommandData) return insufficientDataAnswer("executive-summary");

  const top = command.topPriorities.slice(0, 3);
  const evidence: AskVyronEvidence[] = [
    {
      label: "Health score",
      value: command.summary.healthScore != null ? `${command.summary.healthScore}/100` : "—",
    },
    { label: "Active warnings", value: String(command.summary.activeWarnings) },
    { label: "Forecast risks", value: String(command.summary.forecastRisks) },
    { label: "Estimated exposure", value: command.summary.exposureLabel },
    { label: "Confidence", value: command.summary.confidence },
  ];

  return {
    answer: command.isHealthy
      ? "Business is operating within expected thresholds across the intelligence chain."
      : `${command.summary.activeWarnings} warning(s), ${command.summary.forecastRisks} forecast risk(s) and ${command.summary.actions} action(s) are active across the executive intelligence pipeline.`,
    summary: top[0]
      ? `Top executive priority: ${top[0].recommendedResponse}`
      : "Open Autonomous Command Centre for the full intelligence chain.",
    confidence: command.summary.confidence,
    evidence,
    relatedRisks: top.map((row) => row.reason),
    recommendedActions: command.recommendations.slice(0, 4).map((row) => row.title),
    drilldowns: [
      { label: "Autonomous Command Centre", href: "/autonomous-command-centre" },
      { label: "Executive Boardroom", href: "/executive-boardroom" },
      { label: "Decisions Centre", href: "/decisions" },
      { label: "Actions Centre", href: "/actions" },
    ],
    sourceModules: ["Autonomous Command", "Business Health", "Early Warning", "Predictive Risk", "Root Cause", "Decisions", "Actions"],
    category: "executive-summary",
  };
}

export function answerAskVyronQuestion(question: string, input: ActionsInput): AskVyronAnswer {
  const category = classifyAskVyronQuestion(question);

  switch (category) {
    case "margin":
      return buildMarginAnswer(input);
    case "supplier":
      return buildSupplierAnswer(input);
    case "inventory":
      return buildInventoryAnswer(input);
    case "xero":
      return buildXeroAnswer(input);
    case "warnings":
      return buildWarningsAnswer(input);
    case "predictive-risk":
      return buildPredictiveRiskAnswer(input);
    case "root-cause":
      return buildRootCauseAnswer(input);
    case "decisions":
      return buildDecisionsAnswer(input);
    case "actions":
      return buildActionsAnswer(input);
    case "business-health":
      return buildBusinessHealthAnswer(input);
    case "executive-summary":
      return buildExecutiveSummaryAnswer(input);
    default:
      return unknownAnswer();
  }
}

export function buildIntelligenceSourceStatuses(input: ActionsInput): IntelligenceSourceStatus[] {
  const businessHealth = computeBusinessHealthSnapshot(input);
  const earlyWarning = computeEarlyWarningSnapshot(input);
  const predictive = computePredictiveRiskSnapshot(input);
  const rootCause = computeRootCauseSnapshot(input);
  const decisions = computeDecisionsSnapshot(input);
  const actions = computeActionsSnapshot(input);
  const products = input.intelligence?.products.length ?? 0;

  return [
    {
      id: "business-health",
      label: "Business Health",
      status: businessHealth.overallStatus,
      signalCount: businessHealth.scoredCategoryCount,
      href: "/business-health",
      available: businessHealth.scoredCategoryCount > 0,
    },
    {
      id: "early-warning",
      label: "Early Warning",
      status:
        earlyWarning.summary.critical > 0
          ? `${earlyWarning.summary.critical} Critical`
          : earlyWarning.hasMonitoringData
            ? "Monitoring"
            : "Insufficient Data",
      signalCount:
        earlyWarning.summary.critical +
        earlyWarning.summary.high +
        earlyWarning.summary.medium +
        earlyWarning.summary.low,
      href: "/early-warning",
      available: earlyWarning.hasMonitoringData,
    },
    {
      id: "predictive-risk",
      label: "Predictive Risk",
      status: predictive.summary.outlookLabel,
      signalCount: predictive.summary.criticalForecastRisks + predictive.summary.highForecastRisks,
      href: "/predictive-risk",
      available: predictive.hasForecastData,
    },
    {
      id: "root-cause",
      label: "Root Cause",
      status: rootCause.summary.criticalRootCauses > 0 ? "Investigation Required" : "Analysed",
      signalCount: rootCause.investigations.length,
      href: "/root-cause",
      available: rootCause.hasAnalysisData,
    },
    {
      id: "decisions",
      label: "Decisions",
      status: decisions.summary.criticalDecisions > 0 ? "Decisions Pending" : "Reviewed",
      signalCount: decisions.recommendedDecisions.length,
      href: "/decisions",
      available: decisions.hasDecisionData,
    },
    {
      id: "actions",
      label: "Actions",
      status: actions.summary.executionReadiness,
      signalCount: actions.pipeline.length,
      href: "/actions",
      available: actions.hasActionData,
    },
    {
      id: "xero",
      label: "Xero",
      status: input.xeroConnection?.status || "Not Connected",
      signalCount: input.xeroQueueFailed + (input.invoiceSyncReady ? 0 : 1),
      href: "/integrations/xero",
      available: Boolean(input.xeroConnection),
    },
    {
      id: "cost-intelligence",
      label: "Cost Intelligence",
      status: products > 0 ? "Active" : "Insufficient Data",
      signalCount: products,
      href: "/cost-intelligence",
      available: products > 0,
    },
  ];
}

export function buildNoWorkspaceAnswer(): AskVyronAnswer {
  return {
    answer: "Select an active workspace before asking VYRON business questions.",
    summary: "Ask VYRON answers from the active company workspace only — no default tenant fallback.",
    confidence: "High",
    evidence: [],
    relatedRisks: [],
    recommendedActions: ["Log in to a company workspace or select a client from Developer → Clients"],
    drilldowns: [{ label: "Dashboard", href: "/dashboard" }],
    sourceModules: ["Workspace"],
    category: "unknown",
    insufficientData: true,
  };
}
