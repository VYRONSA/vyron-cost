import { computeBusinessHealthSnapshot } from "@/lib/vyron-business-health";
import {
  computeDecisionsSnapshot,
  type DecisionCategory,
  type DecisionConfidence,
  type DecisionOwner,
  type DecisionsInput,
  type ImpactEffortQuadrant,
} from "@/lib/vyron-decisions";
import { computeEarlyWarningSnapshot } from "@/lib/vyron-early-warning";
import { computePredictiveRiskSnapshot } from "@/lib/vyron-predictive-risk";
import { computeRootCauseSnapshot } from "@/lib/vyron-root-cause";

export type ActionCategory = DecisionCategory;
export type ActionPriority = "Critical" | "High" | "Medium" | "Low";
export type ActionStatus = "Ready" | "Recommended" | "Waiting" | "Blocked";
export type ActionOwner = DecisionOwner;
export type ExecutionReadiness = "High" | "Medium" | "Low";

export type ExecutionAction = {
  id: string;
  action: string;
  category: ActionCategory;
  priority: ActionPriority;
  owner: ActionOwner;
  expectedOutcome: string;
  estimatedImpact: string;
  impactValue: number | null;
  riskReduction: string;
  riskReductionValue: number | null;
  status: ActionStatus;
  dueHorizon: string;
  confidence: DecisionConfidence;
  href: string;
  effort: "Low" | "High";
  quadrant: ImpactEffortQuadrant;
  sourceTrace: string[];
};

export type ExecutionPlaybook = {
  id: string;
  title: string;
  category: ActionCategory;
  action: string;
  owner: ActionOwner;
  outcome: string;
  href: string;
};

export type OwnerGroup = {
  id: string;
  owner: ActionOwner;
  totalActions: number;
  criticalActions: number;
  estimatedImpact: number | null;
  impactLabel: string;
  readiness: ExecutionReadiness;
  href: string;
};

export type ActionBlocker = {
  id: string;
  blocker: string;
  severity: ActionPriority;
  affectedActions: string[];
  resolutionPath: string;
  href: string;
};

export type ExecutionQueueItem = {
  id: string;
  rank: number;
  action: string;
  priority: ActionPriority;
  owner: ActionOwner;
  impact: string;
  confidence: DecisionConfidence;
  href: string;
};

export type ExpectedOutcomeSummary = {
  id: string;
  label: string;
  value: string;
  impactValue: number | null;
};

export type ActionsSnapshot = {
  summary: {
    criticalActions: number;
    highPriorityActions: number;
    estimatedOpportunity: number | null;
    opportunityLabel: string;
    estimatedRiskReduction: number | null;
    riskReductionLabel: string;
    executionReadiness: ExecutionReadiness;
  };
  pipeline: ExecutionAction[];
  playbooks: ExecutionPlaybook[];
  impactMatrix: Record<ImpactEffortQuadrant, ExecutionAction[]>;
  ownerGroups: OwnerGroup[];
  blockers: ActionBlocker[];
  executionQueue: ExecutionQueueItem[];
  expectedOutcomes: ExpectedOutcomeSummary[];
  hasActionData: boolean;
};

export type ActionsInput = DecisionsInput;

const PRIORITY_WEIGHT: Record<ActionPriority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const OWNER_HREFS: Record<ActionOwner, string> = {
  Executive: "/executive-boardroom",
  Finance: "/cost-intelligence",
  Procurement: "/suppliers",
  Operations: "/products",
  Inventory: "/inventory/stock",
  Manufacturing: "/manufacturing",
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function priorityFromUrgency(urgency: string): ActionPriority {
  if (urgency === "Immediate") return "Critical";
  if (urgency === "High") return "High";
  if (urgency === "Medium") return "Medium";
  return "Low";
}

function dueHorizonFromPriority(priority: ActionPriority): string {
  if (priority === "Critical") return "Immediate";
  if (priority === "High") return "7 Days";
  return "30 Days";
}

function ownerForCategory(category: ActionCategory, actionText: string): ActionOwner {
  if (category === "Inventory" && actionText.toLowerCase().includes("purchase")) return "Procurement";
  const map: Record<ActionCategory, ActionOwner> = {
    Pricing: "Finance",
    Supplier: "Procurement",
    Inventory: "Inventory",
    Procurement: "Procurement",
    Manufacturing: "Manufacturing",
    Customer: "Executive",
    Xero: "Finance",
    "Data Quality": "Operations",
  };
  return map[category];
}

function buildBlockers(input: ActionsInput): ActionBlocker[] {
  const blockers: ActionBlocker[] = [];
  const products = input.intelligence?.products ?? [];
  const missingPrice = products.filter((row) => !Number(row.selling_price));
  const missingCost = products.filter((row) => !Number(row.total_cost));
  const recipeQuality = input.recipeQuality;

  if (missingPrice.length > 0) {
    blockers.push({
      id: "blocker-missing-prices",
      blocker: "Missing selling prices",
      severity: missingPrice.length >= 5 ? "High" : "Medium",
      affectedActions: [
        "Reprice products below target GP",
        "Complete missing selling prices",
        "Approve repricing on products with suggested price increases",
      ],
      resolutionPath: "Complete selling prices on the product master",
      href: "/products",
    });
  }

  if (missingCost.length > 0) {
    blockers.push({
      id: "blocker-missing-costs",
      blocker: "Missing product costs",
      severity: missingCost.length >= 5 ? "High" : "Medium",
      affectedActions: [
        "Complete BOM cost structures",
        "Complete product and BOM costing",
        "Recalculate BOM costs and review finished product pricing",
      ],
      resolutionPath: "Complete BOM and ingredient costing on products",
      href: "/recipes",
    });
  }

  if (recipeQuality && (recipeQuality.recipesWithoutLines > 0 || recipeQuality.recipesWithoutCosting > 0)) {
    blockers.push({
      id: "blocker-missing-bom",
      blocker: "Missing BOM structures",
      severity: recipeQuality.recipesWithoutLines >= 3 ? "High" : "Medium",
      affectedActions: [
        "Add ingredient lines to incomplete BOMs",
        "Complete BOM cost structures",
        "Recalculate BOM costs and review finished product pricing",
      ],
      resolutionPath: "Complete recipe/BOM ingredient lines and costing",
      href: "/recipes",
    });
  }

  const hasProcurement = Boolean(input.commandData?.procurement.spendThisMonth);
  const inflationCount = input.intelligence?.summary.inflationSuppliers ?? 0;
  if (hasProcurement && inflationCount === 0) {
    blockers.push({
      id: "blocker-supplier-pricing",
      blocker: "Missing supplier pricing history",
      severity: "Medium",
      affectedActions: [
        "Review supplier pricing and alternate sources",
        "Renegotiate critical supplier pricing",
        "Update supplier pricing from GRNs",
      ],
      resolutionPath: "Update supplier costs from GRNs and price history",
      href: "/suppliers",
    });
  }

  if (input.xeroConnection && !input.xeroConnection.connected) {
    blockers.push({
      id: "blocker-xero-disconnected",
      blocker: "Xero disconnected",
      severity: "High",
      affectedActions: [
        "Connect or reconnect Xero integration",
        "Resolve Xero connection and mapping issues",
        "Connect Xero for financial visibility",
      ],
      resolutionPath: "Connect Xero from the integration page",
      href: "/integrations/xero",
    });
  }

  if (!input.invoiceSyncReady && input.xeroConnection?.connected) {
    blockers.push({
      id: "blocker-xero-mapping",
      blocker: "Xero mapping incomplete",
      severity: "High",
      affectedActions: [
        "Complete Xero account mapping",
        "Resolve Xero connection and mapping issues",
        "Retry failed Xero sync queue items",
      ],
      resolutionPath: "Complete sales account and VAT tax type mapping",
      href: "/integrations/xero",
    });
  }

  return blockers;
}

function isActionBlocked(action: ExecutionAction, blockers: ActionBlocker[]): ActionBlocker | null {
  for (const blocker of blockers) {
    const matchesAffected = blocker.affectedActions.some(
      (row) =>
        action.action.toLowerCase().includes(row.toLowerCase()) ||
        row.toLowerCase().includes(action.action.toLowerCase())
    );
    if (matchesAffected) return blocker;

    if (
      blocker.id === "blocker-missing-prices" &&
      action.category === "Pricing" &&
      !action.action.toLowerCase().includes("complete missing")
    ) {
      return blocker;
    }
    if (
      (blocker.id === "blocker-missing-costs" || blocker.id === "blocker-missing-bom") &&
      (action.category === "Manufacturing" || action.action.toLowerCase().includes("bom"))
    ) {
      return blocker;
    }
    if (blocker.id.startsWith("blocker-xero") && action.category === "Xero") {
      return blocker;
    }
    if (blocker.id === "blocker-supplier-pricing" && action.category === "Supplier") {
      return blocker;
    }
  }
  return null;
}

function resolveStatus(action: ExecutionAction, blockers: ActionBlocker[]): ActionStatus {
  const blocker = isActionBlocked(action, blockers);
  if (blocker) return "Blocked";
  if (action.category === "Data Quality") return "Waiting";
  if (action.confidence === "High" && action.priority !== "Low") return "Ready";
  if (action.confidence === "Medium") return "Recommended";
  return "Waiting";
}

function decisionToAction(
  decision: ReturnType<typeof computeDecisionsSnapshot>["recommendedDecisions"][number],
  blockers: ActionBlocker[]
): ExecutionAction {
  const priority = priorityFromUrgency(decision.urgency);
  const owner = ownerForCategory(decision.category, decision.decision);

  const base: ExecutionAction = {
    id: `action-${decision.id}`,
    action: decision.decision,
    category: decision.category,
    priority,
    owner,
    expectedOutcome: decision.expectedImpact,
    estimatedImpact: decision.opportunity,
    impactValue: decision.opportunityValue,
    riskReduction: decision.riskReduction,
    riskReductionValue: decision.riskReductionValue,
    status: "Recommended",
    dueHorizon: dueHorizonFromPriority(priority),
    confidence: decision.confidence,
    href: decision.href,
    effort: decision.effort,
    quadrant: decision.quadrant,
    sourceTrace: [`Decision: ${decision.decision}`, ...decision.sourceSignals.slice(0, 2)],
  };

  return { ...base, status: resolveStatus(base, blockers) };
}

function supplementalActions(
  input: ActionsInput,
  blockers: ActionBlocker[],
  existing: Set<string>
): ExecutionAction[] {
  const extras: ExecutionAction[] = [];
  const earlyWarning = computeEarlyWarningSnapshot(input);
  const predictive = computePredictiveRiskSnapshot(input);
  const rootCause = computeRootCauseSnapshot(input);

  const sources: Array<{ label: string; title: string; explanation: string; outcome: string; href: string; severity: ActionPriority }> = [
    ...earlyWarning.priorityActions.map((row) => ({
      label: "Early Warning",
      title: row.title,
      explanation: row.explanation,
      outcome: row.outcome,
      href: row.href,
      severity: row.severity as ActionPriority,
    })),
    ...predictive.preventiveActions.map((row) => ({
      label: "Predictive Risk",
      title: row.title,
      explanation: row.whyItMatters,
      outcome: row.expectedBenefit,
      href: row.href,
      severity: (row.priority <= 3 ? "High" : "Medium") as ActionPriority,
    })),
    ...rootCause.correctiveActions.map((row) => ({
      label: "Root Cause",
      title: row.action,
      explanation: row.rootCause,
      outcome: row.expectedImprovement,
      href: row.href,
      severity: (row.priority <= 3 ? "Critical" : "High") as ActionPriority,
    })),
  ];

  sources.forEach((source, index) => {
    const key = source.title.trim();
    if (existing.has(key)) return;
    existing.add(key);

    const priority = source.severity;
    const base: ExecutionAction = {
      id: `action-supplemental-${index}-${source.label.toLowerCase().replace(/\s+/g, "-")}`,
      action: source.title,
      category: inferCategory(source.title),
      priority,
      owner: ownerForCategory(inferCategory(source.title), source.title),
      expectedOutcome: source.outcome,
      estimatedImpact: source.outcome,
      impactValue: null,
      riskReduction: source.explanation,
      riskReductionValue: null,
      status: "Recommended",
      dueHorizon: dueHorizonFromPriority(priority),
      confidence: "High",
      href: source.href,
      effort: inferCategory(source.title) === "Data Quality" ? "High" : "Low",
      quadrant: priorityWeightQuadrant(priority, inferCategory(source.title) === "Data Quality" ? "High" : "Low"),
      sourceTrace: [`${source.label}: ${source.title}`, source.explanation],
    };
    extras.push({ ...base, status: resolveStatus(base, blockers) });
  });

  return extras;
}

function inferCategory(text: string): ActionCategory {
  const lower = text.toLowerCase();
  if (lower.includes("xero") || lower.includes("mapping") || lower.includes("token")) return "Xero";
  if (lower.includes("supplier") || lower.includes("procurement") || lower.includes("po")) return "Supplier";
  if (lower.includes("inventory") || lower.includes("stock") || lower.includes("slow-moving")) return "Inventory";
  if (lower.includes("manufacturing") || lower.includes("wastage") || lower.includes("yield") || lower.includes("bom"))
    return "Manufacturing";
  if (lower.includes("customer") || lower.includes("invoice")) return "Customer";
  if (lower.includes("product") || lower.includes("price") || lower.includes("margin") || lower.includes("repric"))
    return "Pricing";
  if (lower.includes("cost") || lower.includes("data") || lower.includes("recipe")) return "Data Quality";
  return "Pricing";
}

function priorityWeightQuadrant(priority: ActionPriority, effort: "Low" | "High"): ImpactEffortQuadrant {
  const highImpact = PRIORITY_WEIGHT[priority] >= 3;
  if (highImpact && effort === "Low") return "High Impact / Low Effort";
  if (highImpact && effort === "High") return "High Impact / High Effort";
  if (!highImpact && effort === "Low") return "Low Impact / Low Effort";
  return "Low Impact / High Effort";
}

function buildExecutionPlaybooks(
  input: ActionsInput,
  pipeline: ExecutionAction[]
): ExecutionPlaybook[] {
  const playbooks: ExecutionPlaybook[] = [];
  const intelligence = input.intelligence;

  if (
    pipeline.some((row) => row.category === "Pricing") &&
    (intelligence?.repricingSuggestions.length || (intelligence?.products || []).some((row) => Number(row.gp_gap ?? 0) < 0))
  ) {
    playbooks.push({
      id: "playbook-pricing-recovery",
      title: "Pricing Recovery",
      category: "Pricing",
      action: "Update selling prices on below-target products",
      owner: "Finance",
      outcome: "Margin recovery on recorded GP gaps",
      href: "/reports/product-margins",
    });
  }

  if (pipeline.some((row) => row.category === "Supplier") && intelligence?.supplierInflation.length) {
    playbooks.push({
      id: "playbook-supplier-recovery",
      title: "Supplier Recovery",
      category: "Supplier",
      action: "Negotiate supplier pricing on inflated categories",
      owner: "Procurement",
      outcome: "Cost reduction or containment on procurement spend",
      href: "/suppliers",
    });
  }

  if (pipeline.some((row) => row.category === "Inventory" && row.action.toLowerCase().includes("slow"))) {
    playbooks.push({
      id: "playbook-inventory-recovery",
      title: "Inventory Recovery",
      category: "Inventory",
      action: "Reduce slow-moving stock exposure",
      owner: "Operations",
      outcome: "Lower inventory exposure and working capital pressure",
      href: "/inventory/stock",
    });
  }

  if (pipeline.some((row) => row.category === "Xero")) {
    playbooks.push({
      id: "playbook-xero-recovery",
      title: "Financial Visibility Recovery",
      category: "Xero",
      action: "Resolve Xero connection, mapping and sync queue",
      owner: "Finance",
      outcome: "Improved accounting sync and month-end visibility",
      href: "/integrations/xero",
    });
  }

  if (pipeline.some((row) => row.category === "Manufacturing")) {
    playbooks.push({
      id: "playbook-manufacturing-recovery",
      title: "Manufacturing Recovery",
      category: "Manufacturing",
      action: "Address wastage and recalculate BOM costs",
      owner: "Manufacturing",
      outcome: "Lower input cost per finished unit",
      href: "/manufacturing",
    });
  }

  if (pipeline.some((row) => row.category === "Data Quality")) {
    playbooks.push({
      id: "playbook-data-recovery",
      title: "Data Quality Recovery",
      category: "Data Quality",
      action: "Close master data gaps blocking execution",
      owner: "Operations",
      outcome: "Higher-confidence actions across pricing and margin",
      href: "/products",
    });
  }

  return playbooks;
}

function buildOwnerGroups(pipeline: ExecutionAction[]): OwnerGroup[] {
  const owners: ActionOwner[] = [
    "Executive",
    "Finance",
    "Procurement",
    "Operations",
    "Inventory",
    "Manufacturing",
  ];

  return owners.map((owner) => {
    const items = pipeline.filter((row) => row.owner === owner);
    const impact = items.reduce((sum, row) => sum + Number(row.impactValue || 0), 0);
    const readyCount = items.filter((row) => row.status === "Ready").length;
    const readiness: ExecutionReadiness =
      items.length === 0
        ? "High"
        : readyCount / items.length >= 0.6
          ? "High"
          : readyCount / items.length >= 0.3
            ? "Medium"
            : "Low";

    return {
      id: `owner-${owner.toLowerCase()}`,
      owner,
      totalActions: items.length,
      criticalActions: items.filter((row) => row.priority === "Critical").length,
      estimatedImpact: impact > 0 ? Math.round(impact) : null,
      impactLabel: impact > 0 ? money(impact) : "Outcome not yet quantifiable",
      readiness,
      href: OWNER_HREFS[owner],
    };
  });
}

function buildImpactMatrix(pipeline: ExecutionAction[]): Record<ImpactEffortQuadrant, ExecutionAction[]> {
  const matrix: Record<ImpactEffortQuadrant, ExecutionAction[]> = {
    "High Impact / Low Effort": [],
    "High Impact / High Effort": [],
    "Low Impact / Low Effort": [],
    "Low Impact / High Effort": [],
  };
  pipeline.forEach((row) => {
    matrix[row.quadrant].push(row);
  });
  return matrix;
}

function buildExecutionQueue(pipeline: ExecutionAction[]): ExecutionQueueItem[] {
  return [...pipeline]
    .sort(
      (a, b) =>
        PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
        Number(b.impactValue || 0) - Number(a.impactValue || 0)
    )
    .slice(0, 20)
    .map((row, index) => ({
      id: `queue-${row.id}`,
      rank: index + 1,
      action: row.action,
      priority: row.priority,
      owner: row.owner,
      impact: row.estimatedImpact,
      confidence: row.confidence,
      href: row.href,
    }));
}

function buildExpectedOutcomes(
  decisionsSnapshot: ReturnType<typeof computeDecisionsSnapshot>,
  pipeline: ExecutionAction[]
): ExpectedOutcomeSummary[] {
  const items: ExpectedOutcomeSummary[] = [];

  if (decisionsSnapshot.summary.estimatedOpportunity != null) {
    items.push({
      id: "outcome-margin-recovery",
      label: "Margin recovery opportunities",
      value: decisionsSnapshot.summary.opportunityLabel,
      impactValue: decisionsSnapshot.summary.estimatedOpportunity,
    });
  } else {
    items.push({
      id: "outcome-margin-recovery",
      label: "Margin recovery opportunities",
      value: "Outcome not yet quantifiable",
      impactValue: null,
    });
  }

  if (decisionsSnapshot.summary.estimatedRiskReduction != null) {
    items.push({
      id: "outcome-risk-reduction",
      label: "Risk reduction opportunities",
      value: decisionsSnapshot.summary.riskReductionLabel,
      impactValue: decisionsSnapshot.summary.estimatedRiskReduction,
    });
  } else {
    items.push({
      id: "outcome-risk-reduction",
      label: "Risk reduction opportunities",
      value: "Outcome not yet quantifiable",
      impactValue: null,
    });
  }

  const supplierItems = pipeline.filter((row) => row.category === "Supplier");
  if (supplierItems.length > 0) {
    const impact = supplierItems.reduce((sum, row) => sum + Number(row.impactValue || 0), 0);
    items.push({
      id: "outcome-supplier",
      label: "Supplier improvements",
      value: impact > 0 ? `${money(impact)}/month addressable procurement exposure` : `${supplierItems.length} supplier action(s) on record`,
      impactValue: impact > 0 ? impact : null,
    });
  }

  const inventoryItems = pipeline.filter((row) => row.category === "Inventory");
  if (inventoryItems.length > 0) {
    const impact = inventoryItems.reduce((sum, row) => sum + Number(row.impactValue || 0), 0);
    items.push({
      id: "outcome-inventory",
      label: "Inventory improvements",
      value: impact > 0 ? `${money(impact)} inventory exposure addressable` : `${inventoryItems.length} inventory action(s) on record`,
      impactValue: impact > 0 ? impact : null,
    });
  }

  const dqItems = pipeline.filter((row) => row.category === "Data Quality");
  if (dqItems.length > 0) {
    items.push({
      id: "outcome-data-quality",
      label: "Data quality improvements",
      value: `${dqItems.length} master data action(s) to improve execution confidence`,
      impactValue: null,
    });
  }

  const xeroItems = pipeline.filter((row) => row.category === "Xero");
  if (xeroItems.length > 0) {
    items.push({
      id: "outcome-financial-visibility",
      label: "Financial visibility improvements",
      value: `${xeroItems.length} Xero integration action(s) to restore accounting sync`,
      impactValue: null,
    });
  }

  return items;
}

function computeExecutionReadiness(pipeline: ExecutionAction[]): ExecutionReadiness {
  if (!pipeline.length) return "Low";
  const ready = pipeline.filter((row) => row.status === "Ready").length;
  const blocked = pipeline.filter((row) => row.status === "Blocked").length;
  if (blocked / pipeline.length >= 0.4) return "Low";
  if (ready / pipeline.length >= 0.5) return "High";
  if (ready / pipeline.length >= 0.25) return "Medium";
  return "Low";
}

function dedupePipeline(pipeline: ExecutionAction[]): ExecutionAction[] {
  const seen = new Set<string>();
  const result: ExecutionAction[] = [];
  for (const row of pipeline) {
    const key = row.action.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result.sort(
    (a, b) =>
      PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
      Number(b.impactValue || 0) - Number(a.impactValue || 0)
  );
}

export function computeActionsSnapshot(input: ActionsInput): ActionsSnapshot {
  const decisionsSnapshot = computeDecisionsSnapshot(input);
  computeEarlyWarningSnapshot(input);
  computePredictiveRiskSnapshot(input);
  computeRootCauseSnapshot(input);
  computeBusinessHealthSnapshot(input);

  const blockers = buildBlockers(input);
  const fromDecisions = decisionsSnapshot.recommendedDecisions.map((row) => decisionToAction(row, blockers));
  const existing = new Set(fromDecisions.map((row) => row.action.trim()));
  const supplemental = supplementalActions(input, blockers, existing);
  const pipeline = dedupePipeline([...fromDecisions, ...supplemental]);

  const opportunityTotal = pipeline.reduce((sum, row) => sum + Number(row.impactValue || 0), 0);
  const riskTotal = pipeline.reduce((sum, row) => sum + Number(row.riskReductionValue || 0), 0);

  return {
    summary: {
      criticalActions: pipeline.filter((row) => row.priority === "Critical").length,
      highPriorityActions: pipeline.filter((row) => row.priority === "Critical" || row.priority === "High").length,
      estimatedOpportunity: opportunityTotal > 0 ? Math.round(opportunityTotal) : null,
      opportunityLabel: opportunityTotal > 0 ? money(opportunityTotal) : "Opportunity Not Yet Quantifiable",
      estimatedRiskReduction: riskTotal > 0 ? Math.round(riskTotal) : null,
      riskReductionLabel: riskTotal > 0 ? money(riskTotal) : "Opportunity Not Yet Quantifiable",
      executionReadiness: computeExecutionReadiness(pipeline),
    },
    pipeline,
    playbooks: buildExecutionPlaybooks(input, pipeline),
    impactMatrix: buildImpactMatrix(pipeline),
    ownerGroups: buildOwnerGroups(pipeline),
    blockers,
    executionQueue: buildExecutionQueue(pipeline),
    expectedOutcomes: buildExpectedOutcomes(decisionsSnapshot, pipeline),
    hasActionData: decisionsSnapshot.hasDecisionData,
  };
}
