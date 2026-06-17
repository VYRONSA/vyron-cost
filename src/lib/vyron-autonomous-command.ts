import { computeActionsSnapshot, type ActionBlocker, type ActionsInput } from "@/lib/vyron-actions";
import { computeBusinessHealthSnapshot } from "@/lib/vyron-business-health";
import {
  computeDecisionsSnapshot,
  type DecisionConfidence,
  type DecisionOwner,
} from "@/lib/vyron-decisions";
import { computeEarlyWarningSnapshot } from "@/lib/vyron-early-warning";
import { computePredictiveRiskSnapshot } from "@/lib/vyron-predictive-risk";
import { computeRootCauseSnapshot } from "@/lib/vyron-root-cause";

export type AutonomousCommandInput = ActionsInput;

export type CommandPriority = "Critical" | "High" | "Medium" | "Low";

export type IntelligencePipelineStage = {
  id: string;
  label: string;
  count: number;
  status: string;
  severity: CommandPriority | "None";
  href: string;
};

export type ExecutivePriority = {
  id: string;
  priority: CommandPriority;
  category: string;
  reason: string;
  recommendedResponse: string;
  owner: DecisionOwner | string;
  href: string;
  source: string;
};

export type ExposureCategory = {
  id: string;
  label: string;
  value: string;
  amount: number | null;
  href: string;
};

export type AutonomousRecommendation = {
  id: string;
  title: string;
  confidence: DecisionConfidence;
  impact: string;
  priority: CommandPriority;
  href: string;
  source: string;
};

export type ExecutionReadinessSummary = {
  ready: number;
  waiting: number;
  blocked: number;
  readiness: "High" | "Medium" | "Low";
};

export type AggregatedBlocker = {
  id: string;
  blocker: string;
  severity: CommandPriority;
  affectedItems: string[];
  resolutionPath: string;
  href: string;
  source: string;
};

export type CommandQueueItem = {
  id: string;
  rank: number;
  priority: CommandPriority;
  type: "Decision" | "Action";
  title: string;
  owner: string;
  impact: string;
  confidence: DecisionConfidence;
  href: string;
};

export type AutonomousCommandSnapshot = {
  summary: {
    healthScore: number | null;
    healthStatus: string;
    activeWarnings: number;
    forecastRisks: number;
    rootCauses: number;
    decisions: number;
    actions: number;
    estimatedExposure: number | null;
    exposureLabel: string;
    confidence: DecisionConfidence;
  };
  pipeline: IntelligencePipelineStage[];
  topPriorities: ExecutivePriority[];
  exposureCentre: ExposureCategory[];
  recommendations: AutonomousRecommendation[];
  executionReadiness: ExecutionReadinessSummary;
  blockers: AggregatedBlocker[];
  commandQueue: CommandQueueItem[];
  hasCommandData: boolean;
  isHealthy: boolean;
};

const PRIORITY_WEIGHT: Record<CommandPriority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const CONFIDENCE_WEIGHT: Record<DecisionConfidence, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function lowestConfidence(...levels: DecisionConfidence[]): DecisionConfidence {
  return levels.reduce(
    (lowest, level) => (CONFIDENCE_WEIGHT[level] < CONFIDENCE_WEIGHT[lowest] ? level : lowest),
    "High" as DecisionConfidence
  );
}

function urgencyToPriority(urgency: string): CommandPriority {
  if (urgency === "Immediate") return "Critical";
  if (urgency === "High") return "High";
  if (urgency === "Medium") return "Medium";
  return "Low";
}

function warningStageStatus(critical: number, high: number): string {
  if (critical > 0) return "Critical";
  if (high > 0) return "Elevated";
  return "Monitoring";
}

function countStageSeverity(critical: number, high: number): CommandPriority | "None" {
  if (critical > 0) return "Critical";
  if (high > 0) return "High";
  return "None";
}

function buildPipelineStages(
  businessHealth: ReturnType<typeof computeBusinessHealthSnapshot>,
  earlyWarning: ReturnType<typeof computeEarlyWarningSnapshot>,
  predictive: ReturnType<typeof computePredictiveRiskSnapshot>,
  rootCause: ReturnType<typeof computeRootCauseSnapshot>,
  decisions: ReturnType<typeof computeDecisionsSnapshot>,
  actions: ReturnType<typeof computeActionsSnapshot>
): IntelligencePipelineStage[] {
  const warningCount =
    earlyWarning.summary.critical + earlyWarning.summary.high + earlyWarning.summary.medium + earlyWarning.summary.low;
  const forecastCount = predictive.summary.criticalForecastRisks + predictive.summary.highForecastRisks;
  const rootCauseCount = rootCause.investigations.length;
  const decisionCount = decisions.recommendedDecisions.length;
  const actionCount = actions.pipeline.length;

  return [
    {
      id: "stage-business-health",
      label: "Business Health",
      count: businessHealth.scoredCategoryCount,
      status: businessHealth.overallStatus,
      severity:
        businessHealth.overallStatus === "Critical"
          ? "Critical"
          : businessHealth.overallStatus === "Risk"
            ? "High"
            : businessHealth.overallStatus === "Watch"
              ? "Medium"
              : "None",
      href: "/business-health",
    },
    {
      id: "stage-early-warning",
      label: "Early Warning",
      count: warningCount,
      status: warningStageStatus(earlyWarning.summary.critical, earlyWarning.summary.high),
      severity: countStageSeverity(earlyWarning.summary.critical, earlyWarning.summary.high),
      href: "/early-warning",
    },
    {
      id: "stage-predictive-risk",
      label: "Predictive Risk",
      count: forecastCount,
      status: predictive.summary.outlookLabel,
      severity: countStageSeverity(predictive.summary.criticalForecastRisks, predictive.summary.highForecastRisks),
      href: "/predictive-risk",
    },
    {
      id: "stage-root-cause",
      label: "Root Cause",
      count: rootCauseCount,
      status: rootCause.summary.criticalRootCauses > 0 ? "Investigation Required" : "Analysed",
      severity: countStageSeverity(rootCause.summary.criticalRootCauses, rootCause.summary.highImpactCauses),
      href: "/root-cause",
    },
    {
      id: "stage-decisions",
      label: "Decisions",
      count: decisionCount,
      status: decisions.summary.criticalDecisions > 0 ? "Decisions Pending" : "Reviewed",
      severity: countStageSeverity(decisions.summary.criticalDecisions, decisions.summary.highImpactDecisions),
      href: "/decisions",
    },
    {
      id: "stage-actions",
      label: "Actions",
      count: actionCount,
      status: actions.summary.executionReadiness,
      severity: countStageSeverity(actions.summary.criticalActions, actions.summary.highPriorityActions - actions.summary.criticalActions),
      href: "/actions",
    },
  ];
}

function buildTopPriorities(
  earlyWarning: ReturnType<typeof computeEarlyWarningSnapshot>,
  predictive: ReturnType<typeof computePredictiveRiskSnapshot>,
  rootCause: ReturnType<typeof computeRootCauseSnapshot>,
  decisions: ReturnType<typeof computeDecisionsSnapshot>,
  actions: ReturnType<typeof computeActionsSnapshot>
): ExecutivePriority[] {
  const items: Array<ExecutivePriority & { weight: number }> = [];

  earlyWarning.topRisks
    .filter((row) => row.severity === "Critical" || row.severity === "High")
    .forEach((row, index) => {
      items.push({
        id: `priority-warning-${row.id}`,
        priority: row.severity,
        category: "Early Warning",
        reason: row.risk,
        recommendedResponse: row.recommendedResponse,
        owner: "Executive",
        href: row.href,
        source: "Early Warning",
        weight: PRIORITY_WEIGHT[row.severity] * 10 - index,
      });
    });

  predictive.topFutureRisks
    .filter((row) => row.severity === "Critical" || row.severity === "High")
    .forEach((row, index) => {
      items.push({
        id: `priority-forecast-${row.id}`,
        priority: row.severity,
        category: "Predictive Risk",
        reason: row.risk,
        recommendedResponse: row.recommendedResponse,
        owner: "Executive",
        href: row.href,
        source: "Predictive Risk",
        weight: PRIORITY_WEIGHT[row.severity] * 10 - index,
      });
    });

  rootCause.investigations
    .filter((row) => row.severity === "Critical" || row.severity === "High")
    .forEach((row, index) => {
      items.push({
        id: `priority-root-${row.id}`,
        priority: row.severity,
        category: row.category,
        reason: row.problem,
        recommendedResponse: row.recommendedResolution,
        owner: row.category === "Supplier" || row.category === "Procurement" ? "Procurement" : "Operations",
        href: row.href,
        source: "Root Cause",
        weight: PRIORITY_WEIGHT[row.severity] * 10 - index,
      });
    });

  decisions.recommendedDecisions
    .filter((row) => row.urgency === "Immediate" || row.urgency === "High")
    .forEach((row, index) => {
      const priority = urgencyToPriority(row.urgency);
      items.push({
        id: `priority-decision-${row.id}`,
        priority,
        category: row.category,
        reason: row.whyRecommended,
        recommendedResponse: row.decision,
        owner: row.category === "Supplier" ? "Procurement" : row.category === "Pricing" ? "Finance" : "Executive",
        href: row.href,
        source: "Decisions",
        weight: PRIORITY_WEIGHT[priority] * 10 - index,
      });
    });

  actions.pipeline
    .filter((row) => row.priority === "Critical" || row.priority === "High")
    .forEach((row, index) => {
      items.push({
        id: `priority-action-${row.id}`,
        priority: row.priority,
        category: row.category,
        reason: row.sourceTrace[0] || row.action,
        recommendedResponse: row.action,
        owner: row.owner,
        href: row.href,
        source: "Actions",
        weight: PRIORITY_WEIGHT[row.priority] * 10 - index,
      });
    });

  const seen = new Set<string>();
  return items
    .sort((a, b) => b.weight - a.weight)
    .filter((row) => {
      const key = row.reason.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10)
    .map(({ weight: _weight, ...row }) => row);
}

function buildExposureCentre(
  input: AutonomousCommandInput,
  earlyWarning: ReturnType<typeof computeEarlyWarningSnapshot>,
  rootCause: ReturnType<typeof computeRootCauseSnapshot>
): ExposureCategory[] {
  const intelligence = input.intelligence;
  const categories: ExposureCategory[] = [];

  const marginCard = earlyWarning.categoryCards.find((row) => row.id === "margin");
  const marginExposure = rootCause.clusters.find((row) => row.label === "Pricing Issues");
  const marginAmount = marginExposure?.exposure ?? marginCard?.count ? earlyWarning.summary.potentialExposure : null;
  categories.push({
    id: "exposure-margin",
    label: "Margin",
    value:
      marginAmount != null && marginAmount > 0
        ? money(marginAmount)
        : marginCard && marginCard.count > 0
          ? marginCard.mainIssue
          : "Exposure Not Yet Measurable",
    amount: marginAmount != null && marginAmount > 0 ? marginAmount : null,
    href: "/cost-intelligence",
  });

  const supplierInflation = intelligence?.supplierInflation ?? [];
  const supplierExposure = supplierInflation.reduce((sum, row) => sum + Number(row.monthlyExposure || 0), 0);
  categories.push({
    id: "exposure-supplier",
    label: "Supplier",
    value: supplierExposure > 0 ? `${money(supplierExposure)}/month inflation exposure` : "Exposure Not Yet Measurable",
    amount: supplierExposure > 0 ? supplierExposure : null,
    href: "/suppliers",
  });

  const inventoryCard = earlyWarning.categoryCards.find((row) => row.id === "inventory");
  const inventoryCluster = rootCause.clusters.find((row) => row.label === "Inventory Issues");
  const inventoryAmount = inventoryCluster?.exposure ?? null;
  categories.push({
    id: "exposure-inventory",
    label: "Inventory",
    value:
      inventoryAmount != null && inventoryAmount > 0
        ? money(inventoryAmount)
        : inventoryCard && inventoryCard.count > 0
          ? inventoryCard.mainIssue
          : "Exposure Not Yet Measurable",
    amount: inventoryAmount != null && inventoryAmount > 0 ? inventoryAmount : null,
    href: "/inventory/stock",
  });

  const mfgCard = earlyWarning.categoryCards.find((row) => row.id === "manufacturing");
  const mfgCluster = rootCause.clusters.find((row) => row.label === "Manufacturing Issues");
  categories.push({
    id: "exposure-manufacturing",
    label: "Manufacturing",
    value:
      mfgCluster && mfgCluster.problemCount > 0
        ? `${mfgCluster.problemCount} manufacturing issue(s) identified`
        : mfgCard && mfgCard.count > 0
          ? mfgCard.mainIssue
          : "Exposure Not Yet Measurable",
    amount: null,
    href: "/manufacturing",
  });

  const customerCard = earlyWarning.categoryCards.find((row) => row.id === "customer");
  const customerSales = input.invoiceSummary?.monthlySales ?? 0;
  categories.push({
    id: "exposure-customer",
    label: "Customer",
    value:
      customerSales > 0
        ? `${money(customerSales)} monthly posted sales`
        : customerCard && customerCard.count > 0
          ? customerCard.mainIssue
          : "Exposure Not Yet Measurable",
    amount: customerSales > 0 ? customerSales : null,
    href: "/customer-invoices",
  });

  const xeroCard = earlyWarning.categoryCards.find((row) => row.id === "xero");
  const xeroCluster = rootCause.clusters.find((row) => row.label === "Financial Visibility Issues");
  categories.push({
    id: "exposure-financial-visibility",
    label: "Financial Visibility",
    value:
      xeroCluster && xeroCluster.problemCount > 0
        ? xeroCluster.exposureLabel
        : xeroCard && xeroCard.count > 0
          ? xeroCard.mainIssue
          : input.xeroConnection?.connected
            ? "Xero connected — sync health monitored"
            : "Exposure Not Yet Measurable",
    amount: xeroCluster?.exposure ?? null,
    href: "/integrations/xero",
  });

  return categories;
}

function buildRecommendations(
  earlyWarning: ReturnType<typeof computeEarlyWarningSnapshot>,
  predictive: ReturnType<typeof computePredictiveRiskSnapshot>,
  rootCause: ReturnType<typeof computeRootCauseSnapshot>,
  decisions: ReturnType<typeof computeDecisionsSnapshot>,
  actions: ReturnType<typeof computeActionsSnapshot>
): AutonomousRecommendation[] {
  const items: Array<AutonomousRecommendation & { weight: number }> = [];

  decisions.recommendedDecisions.slice(0, 8).forEach((row, index) => {
    const priority = urgencyToPriority(row.urgency);
    items.push({
      id: `rec-decision-${row.id}`,
      title: row.decision,
      confidence: row.confidence,
      impact: row.expectedImpact,
      priority,
      href: row.href,
      source: "Decisions",
      weight: PRIORITY_WEIGHT[priority] * 10 - index,
    });
  });

  actions.playbooks.forEach((row, index) => {
    items.push({
      id: `rec-playbook-${row.id}`,
      title: row.action,
      confidence: "High",
      impact: row.outcome,
      priority: "High",
      href: row.href,
      source: "Actions",
      weight: 25 - index,
    });
  });

  earlyWarning.priorityActions.slice(0, 5).forEach((row, index) => {
    items.push({
      id: `rec-warning-${row.id}`,
      title: row.title,
      confidence: "High",
      impact: row.outcome,
      priority: row.severity,
      href: row.href,
      source: "Early Warning",
      weight: PRIORITY_WEIGHT[row.severity] * 8 - index,
    });
  });

  predictive.preventiveActions.slice(0, 5).forEach((row, index) => {
    const priority: CommandPriority = row.priority <= 3 ? "High" : "Medium";
    items.push({
      id: `rec-predictive-${row.id}`,
      title: row.title,
      confidence: "Medium",
      impact: row.expectedBenefit,
      priority,
      href: row.href,
      source: "Predictive Risk",
      weight: PRIORITY_WEIGHT[priority] * 7 - index,
    });
  });

  rootCause.correctiveActions.slice(0, 5).forEach((row, index) => {
    const priority: CommandPriority = row.priority <= 3 ? "Critical" : "High";
    items.push({
      id: `rec-root-${row.id}`,
      title: row.action,
      confidence: "High",
      impact: row.expectedImprovement,
      priority,
      href: row.href,
      source: "Root Cause",
      weight: PRIORITY_WEIGHT[priority] * 7 - index,
    });
  });

  const seen = new Set<string>();
  return items
    .sort((a, b) => b.weight - a.weight)
    .filter((row) => {
      const key = row.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map(({ weight: _weight, ...row }) => row);
}

function buildAggregatedBlockers(
  actions: ReturnType<typeof computeActionsSnapshot>,
  decisions: ReturnType<typeof computeDecisionsSnapshot>,
  rootCause: ReturnType<typeof computeRootCauseSnapshot>,
  earlyWarning: ReturnType<typeof computeEarlyWarningSnapshot>
): AggregatedBlocker[] {
  const blockers: AggregatedBlocker[] = actions.blockers.map((row: ActionBlocker) => ({
    id: row.id,
    blocker: row.blocker,
    severity: row.severity,
    affectedItems: row.affectedActions,
    resolutionPath: row.resolutionPath,
    href: row.href,
    source: "Actions",
  }));

  decisions.conflicts.forEach((row, index) => {
    blockers.push({
      id: `blocker-decision-conflict-${index}`,
      blocker: row.title,
      severity: "Medium",
      affectedItems: [row.decisionA, row.decisionB],
      resolutionPath: row.tension,
      href: "/decisions",
      source: "Decisions",
    });
  });

  rootCause.recurringCauses
    .filter((row) => row.severity === "Critical" || row.severity === "High")
    .slice(0, 3)
    .forEach((row, index) => {
      blockers.push({
        id: `blocker-recurring-${index}`,
        blocker: `Recurring cause: ${row.cause}`,
        severity: row.severity,
        affectedItems: row.sources,
        resolutionPath: "Resolve underlying root cause to unblock dependent actions",
        href: row.href,
        source: "Root Cause",
      });
    });

  earlyWarning.dataQualityWarnings.slice(0, 3).forEach((row, index) => {
    blockers.push({
      id: `blocker-dq-${index}`,
      blocker: row.title,
      severity: row.severity,
      affectedItems: [row.recommendedAction],
      resolutionPath: row.description,
      href: row.href,
      source: row.category === "Xero" ? "Xero" : "Early Warning",
    });
  });

  const seen = new Set<string>();
  return blockers.filter((row) => {
    const key = row.blocker.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCommandQueue(
  decisions: ReturnType<typeof computeDecisionsSnapshot>,
  actions: ReturnType<typeof computeActionsSnapshot>
): CommandQueueItem[] {
  const items: Array<CommandQueueItem & { weight: number }> = [];

  decisions.decisionQueue.forEach((row) => {
    const priority: CommandPriority =
      row.priority <= 2 ? "Critical" : row.priority <= 4 ? "High" : row.priority <= 6 ? "Medium" : "Low";
    items.push({
      id: `queue-decision-${row.id}`,
      rank: 0,
      priority,
      type: "Decision",
      title: row.decision,
      owner: row.suggestedOwner,
      impact: row.impact,
      confidence: row.confidence,
      href: row.href,
      weight: PRIORITY_WEIGHT[priority] * 100 - row.priority,
    });
  });

  actions.executionQueue.forEach((row) => {
    items.push({
      id: `queue-action-${row.id}`,
      rank: 0,
      priority: row.priority,
      type: "Action",
      title: row.action,
      owner: row.owner,
      impact: row.impact,
      confidence: row.confidence,
      href: row.href,
      weight: PRIORITY_WEIGHT[row.priority] * 100 - row.rank,
    });
  });

  const seen = new Set<string>();
  return items
    .sort((a, b) => b.weight - a.weight)
    .filter((row) => {
      const key = row.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function computeEstimatedExposure(
  earlyWarning: ReturnType<typeof computeEarlyWarningSnapshot>,
  predictive: ReturnType<typeof computePredictiveRiskSnapshot>,
  rootCause: ReturnType<typeof computeRootCauseSnapshot>,
  decisions: ReturnType<typeof computeDecisionsSnapshot>
): { amount: number | null; label: string } {
  const candidates = [
    earlyWarning.summary.potentialExposure,
    predictive.summary.forecastExposure,
    rootCause.summary.estimatedExposure,
    decisions.summary.estimatedOpportunity,
  ].filter((value): value is number => value != null && value > 0);

  if (!candidates.length) {
    return { amount: null, label: "Exposure Not Yet Measurable" };
  }

  const amount = Math.max(...candidates);
  return { amount: Math.round(amount), label: money(amount) };
}

export function computeAutonomousCommandSnapshot(input: AutonomousCommandInput): AutonomousCommandSnapshot {
  const businessHealth = computeBusinessHealthSnapshot(input);
  const earlyWarning = computeEarlyWarningSnapshot(input);
  const predictive = computePredictiveRiskSnapshot(input);
  const rootCause = computeRootCauseSnapshot(input);
  const decisions = computeDecisionsSnapshot(input);
  const actions = computeActionsSnapshot(input);

  const exposure = computeEstimatedExposure(earlyWarning, predictive, rootCause, decisions);
  const confidence = lowestConfidence(
    decisions.summary.confidenceLevel,
    predictive.summary.confidenceLevel,
    rootCause.summary.confidenceLevel
  );

  const activeWarnings =
    earlyWarning.summary.critical + earlyWarning.summary.high + earlyWarning.summary.medium + earlyWarning.summary.low;
  const forecastRisks = predictive.summary.criticalForecastRisks + predictive.summary.highForecastRisks;

  const pipeline = actions.pipeline;
  const executionReadiness: ExecutionReadinessSummary = {
    ready: pipeline.filter((row) => row.status === "Ready").length,
    waiting: pipeline.filter((row) => row.status === "Waiting" || row.status === "Recommended").length,
    blocked: pipeline.filter((row) => row.status === "Blocked").length,
    readiness: actions.summary.executionReadiness,
  };

  const hasCommandData = earlyWarning.hasMonitoringData;

  const isHealthy =
    hasCommandData &&
    businessHealth.overallStatus === "Healthy" &&
    earlyWarning.summary.critical === 0 &&
    earlyWarning.summary.high === 0 &&
    predictive.summary.criticalForecastRisks === 0 &&
    rootCause.summary.criticalRootCauses === 0 &&
    decisions.summary.criticalDecisions === 0 &&
    actions.summary.criticalActions === 0;

  return {
    summary: {
      healthScore: businessHealth.overallScore,
      healthStatus: businessHealth.overallStatus,
      activeWarnings,
      forecastRisks,
      rootCauses: rootCause.investigations.length,
      decisions: decisions.recommendedDecisions.length,
      actions: actions.pipeline.length,
      estimatedExposure: exposure.amount,
      exposureLabel: exposure.label,
      confidence,
    },
    pipeline: buildPipelineStages(businessHealth, earlyWarning, predictive, rootCause, decisions, actions),
    topPriorities: buildTopPriorities(earlyWarning, predictive, rootCause, decisions, actions),
    exposureCentre: buildExposureCentre(input, earlyWarning, rootCause),
    recommendations: buildRecommendations(earlyWarning, predictive, rootCause, decisions, actions),
    executionReadiness,
    blockers: buildAggregatedBlockers(actions, decisions, rootCause, earlyWarning),
    commandQueue: buildCommandQueue(decisions, actions),
    hasCommandData,
    isHealthy,
  };
}
