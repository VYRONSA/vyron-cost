import { computeBusinessHealthSnapshot } from "@/lib/vyron-business-health";
import { computeEarlyWarningSnapshot } from "@/lib/vyron-early-warning";
import type { WarningCategory, WarningSeverity } from "@/lib/vyron-early-warning";
import { computePredictiveRiskSnapshot } from "@/lib/vyron-predictive-risk";
import {
  computeRootCauseSnapshot,
  type RootCauseInput,
  type RootCauseInvestigation,
} from "@/lib/vyron-root-cause";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";

export type DecisionCategory =
  | "Pricing"
  | "Supplier"
  | "Inventory"
  | "Procurement"
  | "Manufacturing"
  | "Customer"
  | "Xero"
  | "Data Quality";

export type DecisionUrgency = "Immediate" | "High" | "Medium" | "Low";
export type DecisionConfidence = "High" | "Medium" | "Low";
export type DecisionOwner =
  | "Executive"
  | "Finance"
  | "Procurement"
  | "Operations"
  | "Inventory"
  | "Manufacturing";

export type ImpactEffortQuadrant =
  | "High Impact / Low Effort"
  | "High Impact / High Effort"
  | "Low Impact / Low Effort"
  | "Low Impact / High Effort";

export type ExecutiveDecision = {
  id: string;
  decision: string;
  category: DecisionCategory;
  whyRecommended: string;
  expectedImpact: string;
  urgency: DecisionUrgency;
  confidence: DecisionConfidence;
  riskReduction: string;
  opportunity: string;
  opportunityValue: number | null;
  riskReductionValue: number | null;
  href: string;
  impactScore: number;
  effort: "Low" | "High";
  quadrant: ImpactEffortQuadrant;
  sourceSignals: string[];
};

export type DecisionPlaybook = {
  id: string;
  title: string;
  category: DecisionCategory;
  decision: string;
  reason: string;
  expectedResult: string;
  confidence: DecisionConfidence;
  href: string;
};

export type OpportunityItem = {
  id: string;
  opportunity: string;
  estimatedImpact: string;
  impactValue: number | null;
  confidence: DecisionConfidence;
  recommendedAction: string;
  href: string;
};

export type DecisionConflict = {
  id: string;
  title: string;
  decisionA: string;
  decisionB: string;
  tension: string;
  sourceSignals: string[];
};

export type DecisionQueueItem = {
  id: string;
  priority: number;
  decision: string;
  category: DecisionCategory;
  impact: string;
  confidence: DecisionConfidence;
  suggestedOwner: DecisionOwner;
  href: string;
};

export type DecisionsSnapshot = {
  summary: {
    criticalDecisions: number;
    highImpactDecisions: number;
    estimatedOpportunity: number | null;
    opportunityLabel: string;
    estimatedRiskReduction: number | null;
    riskReductionLabel: string;
    confidenceLevel: DecisionConfidence;
  };
  recommendedDecisions: ExecutiveDecision[];
  playbooks: DecisionPlaybook[];
  impactMatrix: Record<ImpactEffortQuadrant, ExecutiveDecision[]>;
  opportunities: OpportunityItem[];
  conflicts: DecisionConflict[];
  decisionQueue: DecisionQueueItem[];
  hasDecisionData: boolean;
};

export type DecisionsInput = RootCauseInput;

const SEVERITY_WEIGHT: Record<WarningSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const URGENCY_WEIGHT: Record<DecisionUrgency, number> = {
  Immediate: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const CATEGORY_MAP: Record<WarningCategory, DecisionCategory> = {
  Margin: "Pricing",
  Supplier: "Supplier",
  Inventory: "Inventory",
  Procurement: "Procurement",
  Manufacturing: "Manufacturing",
  Customer: "Customer",
  Xero: "Xero",
  "Data Quality": "Data Quality",
};

const OWNER_BY_CATEGORY: Record<DecisionCategory, DecisionOwner> = {
  Pricing: "Executive",
  Supplier: "Procurement",
  Inventory: "Inventory",
  Procurement: "Procurement",
  Manufacturing: "Manufacturing",
  Customer: "Executive",
  Xero: "Finance",
  "Data Quality": "Operations",
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function urgencyFromSeverity(severity: WarningSeverity): DecisionUrgency {
  if (severity === "Critical") return "Immediate";
  if (severity === "High") return "High";
  if (severity === "Medium") return "Medium";
  return "Low";
}

function effortForCategory(category: DecisionCategory, investigationId: string): "Low" | "High" {
  if (category === "Data Quality" || investigationId.includes("bom") || investigationId.includes("missing-cost")) {
    return "High";
  }
  if (category === "Xero" && investigationId.includes("mapping")) return "Low";
  if (category === "Pricing" || category === "Supplier") return "Low";
  return "High";
}

function quadrantFor(impactScore: number, effort: "Low" | "High"): ImpactEffortQuadrant {
  const highImpact = impactScore >= 3;
  if (highImpact && effort === "Low") return "High Impact / Low Effort";
  if (highImpact && effort === "High") return "High Impact / High Effort";
  if (!highImpact && effort === "Low") return "Low Impact / Low Effort";
  return "Low Impact / High Effort";
}

function deriveDecisionText(investigation: RootCauseInvestigation): string {
  const map: Record<string, string> = {
    "rc-margin-critical-below-gp": "Reprice products below target GP",
    "rc-margin-below-gp": "Review and adjust pricing on below-target products",
    "rc-margin-missing-price": "Complete missing selling prices",
    "rc-margin-missing-cost": "Complete BOM cost structures",
    "rc-margin-repricing-review": "Approve suggested repricing from cost intelligence",
    "rc-supplier-critical-inflation": "Renegotiate critical supplier pricing",
    "rc-supplier-inflation": "Review supplier pricing and alternate sources",
    "rc-inventory-slow-moving": "Review slow-moving inventory for write-down or promotion",
    "rc-inventory-negative-stock": "Resolve negative stock immediately",
    "rc-inventory-low-stock": "Raise purchase orders for low-stock SKUs",
    "rc-inventory-overstock": "Reduce overstock purchasing and adjust max levels",
    "rc-procurement-po-variance": "Review PO vs GRN pricing variances",
    "rc-procurement-open-pos": "Clear aged open purchase orders",
    "rc-manufacturing-wastage": "Investigate and reduce manufacturing wastage",
    "rc-manufacturing-bom-movement": "Recalculate BOM costs and review finished product pricing",
    "rc-manufacturing-low-yield": "Review production yield and recipe adherence",
    "rc-customer-low-gp": "Review customer pricing and invoice product mix",
    "rc-customer-concentration": "Diversify customer base and monitor key account margin",
    "rc-xero-disconnected": "Connect or reconnect Xero integration",
    "rc-xero-token-expired": "Refresh Xero token immediately",
    "rc-xero-org-not-selected": "Select Xero organisation",
    "rc-xero-mapping-incomplete": "Complete Xero account mapping",
    "rc-xero-sync-failures": "Retry failed Xero sync queue items",
    "rc-xero-sync-backlog": "Process Xero sync backlog",
    "rc-dq-no-products": "Establish product master with costs and prices",
    "rc-dq-missing-cost": "Complete product and BOM costing",
    "rc-dq-missing-price": "Complete missing selling prices",
    "rc-dq-bom-missing-ingredients": "Add ingredient lines to incomplete BOMs",
    "rc-dq-bom-missing-costing": "Complete BOM cost structures",
    "rc-dq-supplier-pricing-history": "Update supplier pricing from GRNs",
    "rc-dq-no-customer-invoices": "Post customer invoices for profitability tracking",
    "rc-dq-inventory-no-movement": "Review and post missing inventory movements",
    "rc-dq-xero-not-connected": "Connect Xero for financial visibility",
    "rc-dq-xero-token-expired": "Refresh expired Xero token",
    "rc-dq-xero-org-not-selected": "Select Xero organisation",
    "rc-dq-xero-mapping-incomplete": "Complete Xero mapping configuration",
    "rc-dq-xero-queue-failures": "Retry failed Xero sync items",
  };
  return map[investigation.id] || investigation.recommendedResolution;
}

function investigationToDecision(
  investigation: RootCauseInvestigation,
  intelligence: TenantCostIntelligence | null
): ExecutiveDecision {
  const category = CATEGORY_MAP[investigation.category];
  const urgency = urgencyFromSeverity(investigation.severity);
  const effort = effortForCategory(category, investigation.id);
  const impactScore = SEVERITY_WEIGHT[investigation.severity];
  const opportunityValue = investigation.exposureValue;
  const recovery = intelligence?.summary.recoveryMonthly ?? 0;

  let opportunity = investigation.estimatedImpact;
  if (opportunityValue != null && opportunityValue > 0) {
    opportunity = `Estimated opportunity ${money(opportunityValue)}/month`;
  } else if (recovery > 0 && category === "Pricing") {
    opportunity = `Recovery potential ${money(recovery)}/month on cost intelligence`;
  } else {
    opportunity = "Opportunity Not Yet Quantifiable";
  }

  const riskReduction =
    investigation.exposureValue != null && investigation.exposureValue > 0
      ? `Reduce exposure up to ${money(investigation.exposureValue)}/month`
      : `Reduce ${investigation.problem.toLowerCase()} risk`;

  return {
    id: `decision-${investigation.id}`,
    decision: deriveDecisionText(investigation),
    category,
    whyRecommended: `${investigation.rootCause} — ${investigation.evidence[0] || investigation.problem}`,
    expectedImpact: investigation.estimatedImpact,
    urgency,
    confidence: investigation.confidence,
    riskReduction,
    opportunity,
    opportunityValue: opportunityValue ?? (recovery > 0 && category === "Pricing" ? recovery : null),
    riskReductionValue: investigation.exposureValue,
    href: investigation.href,
    impactScore,
    effort,
    quadrant: quadrantFor(impactScore, effort),
    sourceSignals: investigation.evidence,
  };
}

function buildRepricingDecisions(intelligence: TenantCostIntelligence | null): ExecutiveDecision[] {
  if (!intelligence?.repricingSuggestions.length) return [];

  const top = intelligence.repricingSuggestions.slice(0, 3);
  const totalRecovery = top.reduce((sum, row) => sum + Number(row.monthlyRecovery || 0), 0);

  return [
    {
      id: "decision-repricing-batch",
      decision: "Approve repricing on products with suggested price increases",
      category: "Pricing",
      whyRecommended: `${intelligence.repricingSuggestions.length} product(s) have cost intelligence repricing suggestions on record`,
      expectedImpact:
        totalRecovery > 0
          ? `Estimated margin recovery ${money(totalRecovery)}/month across top suggestions`
          : "Margin recovery on below-target products",
      urgency: totalRecovery > 5000 ? "High" : "Medium",
      confidence: "High",
      riskReduction: "Reduce margin erosion from unchanged selling prices",
      opportunity: totalRecovery > 0 ? money(totalRecovery) : "Opportunity Not Yet Quantifiable",
      opportunityValue: totalRecovery > 0 ? totalRecovery : null,
      riskReductionValue: totalRecovery > 0 ? totalRecovery : null,
      href: "/reports/product-margins",
      impactScore: totalRecovery > 5000 ? 3 : 2,
      effort: "Low",
      quadrant: quadrantFor(totalRecovery > 5000 ? 3 : 2, "Low"),
      sourceSignals: top.map(
        (row) => `${row.productName}: ${money(row.currentPrice)} → ${money(row.suggestedPrice)}`
      ),
    },
  ];
}

function buildPlaybooks(
  input: DecisionsInput,
  decisions: ExecutiveDecision[],
  intelligence: TenantCostIntelligence | null
): DecisionPlaybook[] {
  const playbooks: DecisionPlaybook[] = [];
  const hasPricing = decisions.some((row) => row.category === "Pricing");
  const hasSupplier = decisions.some((row) => row.category === "Supplier");
  const hasInflation = Boolean(intelligence?.supplierInflation.length);
  const belowGp = (intelligence?.products || []).filter((row) => Number(row.gp_gap ?? 0) < 0);

  if (hasPricing && hasSupplier && hasInflation && belowGp.length > 0) {
    playbooks.push({
      id: "playbook-pricing",
      title: "Pricing Decision",
      category: "Pricing",
      decision: "Increase selling price on affected products",
      reason: "Supplier inflation exceeds target margin protection on below-GP products",
      expectedResult: "Margin recovery on products with recorded GP gap",
      confidence: "High",
      href: "/cost-intelligence",
    });
  }

  if (hasSupplier && hasInflation && intelligence) {
    const top = intelligence.supplierInflation[0];
    playbooks.push({
      id: "playbook-supplier",
      title: "Supplier Decision",
      category: "Supplier",
      decision: "Review supplier pricing and renegotiate",
      reason: `Supplier inflation trend detected — ${top.supplierName}: ${top.movementPct.toFixed(1)}% movement`,
      expectedResult: "Cost reduction or containment opportunity on procurement spend",
      confidence: "High",
      href: "/suppliers",
    });
  }

  if (decisions.some((row) => row.category === "Inventory" && row.id.includes("slow-moving"))) {
    playbooks.push({
      id: "playbook-inventory",
      title: "Inventory Decision",
      category: "Inventory",
      decision: "Reduce slow-moving stock exposure",
      reason: "Slow-moving inventory signals recorded on stock intelligence",
      expectedResult: "Working capital release and reduced carrying risk",
      confidence: "Medium",
      href: "/inventory/stock",
    });
  }

  if (decisions.some((row) => row.category === "Xero")) {
    playbooks.push({
      id: "playbook-xero",
      title: "Financial Visibility Decision",
      category: "Xero",
      decision: "Resolve Xero connection and mapping issues",
      reason: "Xero integration health signals blocking financial visibility",
      expectedResult: "Improved accounting sync and month-end close confidence",
      confidence: input.xeroQueueFailed > 0 ? "High" : "Medium",
      href: "/integrations/xero",
    });
  }

  if (decisions.some((row) => row.category === "Data Quality")) {
    playbooks.push({
      id: "playbook-data-quality",
      title: "Data Quality Decision",
      category: "Data Quality",
      decision: "Close master data gaps blocking decision intelligence",
      reason: "Missing costs, prices or BOM structures weakening margin and risk signals",
      expectedResult: "Higher confidence decisions across pricing, margin and forecasting",
      confidence: "High",
      href: "/products",
    });
  }

  if (decisions.some((row) => row.category === "Manufacturing")) {
    playbooks.push({
      id: "playbook-manufacturing",
      title: "Manufacturing Decision",
      category: "Manufacturing",
      decision: "Address wastage and yield variance on production runs",
      reason: "Manufacturing wastage or BOM movement signals on record",
      expectedResult: "Lower input cost per finished unit",
      confidence: "High",
      href: "/manufacturing",
    });
  }

  return playbooks;
}

function buildOpportunities(
  intelligence: TenantCostIntelligence | null,
  decisions: ExecutiveDecision[]
): OpportunityItem[] {
  const items: OpportunityItem[] = [];

  if (intelligence && intelligence.summary.recoveryMonthly > 0) {
    items.push({
      id: "opp-margin-recovery",
      opportunity: "Margin recovery",
      estimatedImpact: `${money(intelligence.summary.recoveryMonthly)}/month recovery potential`,
      impactValue: intelligence.summary.recoveryMonthly,
      confidence: "High",
      recommendedAction: "Review repricing suggestions and below-GP products",
      href: "/cost-intelligence",
    });
  }

  const supplierExposure = (intelligence?.supplierInflation || []).reduce(
    (sum, row) => sum + Number(row.monthlyExposure || 0),
    0
  );
  if (supplierExposure > 0) {
    items.push({
      id: "opp-supplier-negotiation",
      opportunity: "Supplier negotiation",
      estimatedImpact: `${money(supplierExposure)}/month procurement exposure addressable`,
      impactValue: supplierExposure,
      confidence: "High",
      recommendedAction: "Renegotiate or alternate suppliers on inflated categories",
      href: "/suppliers",
    });
  }

  const invDecision = decisions.find((row) => row.category === "Inventory" && row.riskReductionValue);
  if (invDecision?.riskReductionValue) {
    items.push({
      id: "opp-inventory-reduction",
      opportunity: "Inventory reduction",
      estimatedImpact: invDecision.expectedImpact,
      impactValue: invDecision.riskReductionValue,
      confidence: invDecision.confidence,
      recommendedAction: "Review slow-moving and overstock positions",
      href: "/inventory/stock",
    });
  }

  const mfgDecision = decisions.find((row) => row.category === "Manufacturing");
  if (mfgDecision) {
    items.push({
      id: "opp-manufacturing-efficiency",
      opportunity: "Manufacturing efficiency",
      estimatedImpact: mfgDecision.expectedImpact,
      impactValue: mfgDecision.opportunityValue,
      confidence: mfgDecision.confidence,
      recommendedAction: mfgDecision.decision,
      href: mfgDecision.href,
    });
  }

  const dqCount = decisions.filter((row) => row.category === "Data Quality").length;
  if (dqCount > 0) {
    items.push({
      id: "opp-data-quality",
      opportunity: "Data quality improvements",
      estimatedImpact: `${dqCount} data gap(s) limiting decision confidence`,
      impactValue: null,
      confidence: "Medium",
      recommendedAction: "Complete product costs, prices and BOM structures",
      href: "/products",
    });
  }

  const xeroCount = decisions.filter((row) => row.category === "Xero").length;
  if (xeroCount > 0) {
    items.push({
      id: "opp-financial-visibility",
      opportunity: "Financial visibility improvements",
      estimatedImpact: `${xeroCount} Xero integration issue(s) on record`,
      impactValue: null,
      confidence: "High",
      recommendedAction: "Resolve Xero connection, mapping and sync queue",
      href: "/integrations/xero",
    });
  }

  return items;
}

function buildConflicts(input: DecisionsInput, decisions: ExecutiveDecision[]): DecisionConflict[] {
  const conflicts: DecisionConflict[] = [];
  const hasSlowMoving = decisions.some((row) => row.id.includes("slow-moving"));
  const hasLowStock = decisions.some((row) => row.id.includes("low-stock"));
  const hasRepricing = decisions.some((row) => row.category === "Pricing" && row.decision.toLowerCase().includes("repric"));
  const hasCustomerRisk = decisions.some((row) => row.category === "Customer");
  const hasSupplierCut = decisions.some((row) => row.category === "Supplier");
  const hasManufacturingQuality = decisions.some((row) => row.category === "Manufacturing");

  if (hasSlowMoving && hasLowStock) {
    conflicts.push({
      id: "conflict-inventory-service",
      title: "Inventory reduction vs service levels",
      decisionA: "Reduce slow-moving inventory exposure",
      decisionB: "Raise purchase orders for low-stock SKUs",
      tension: "Working capital reduction may conflict with stock-out prevention on reorder SKUs",
      sourceSignals: [
        `${input.commandData?.inventory.slowMoving ?? 0} slow-moving SKU(s)`,
        `${input.commandData?.inventory.lowStock ?? 0} low-stock SKU(s)`,
      ],
    });
  }

  if (hasRepricing && hasCustomerRisk) {
    conflicts.push({
      id: "conflict-pricing-retention",
      title: "Repricing vs customer retention",
      decisionA: "Reprice products below target GP",
      decisionB: "Protect customer pricing on concentrated accounts",
      tension: "Margin recovery through repricing may affect key customer relationships",
      sourceSignals: [
        "Below-target GP products on record",
        input.invoiceSummary
          ? `Month invoice GP ${input.invoiceSummary.monthlyGpPct.toFixed(1)}% · ${input.invoiceSummary.uniqueCustomers} customer(s)`
          : "Customer invoice signals on record",
      ],
    });
  }

  if (hasSupplierCut && hasManufacturingQuality) {
    conflicts.push({
      id: "conflict-cost-quality",
      title: "Cost cutting vs manufacturing quality",
      decisionA: "Renegotiate supplier pricing aggressively",
      decisionB: "Investigate manufacturing wastage and yield",
      tension:
        "Supplier cost pressure and production quality both require attention — cutting input cost may affect yield if quality drops",
      sourceSignals: [
        `${input.intelligence?.supplierInflation.length ?? 0} supplier inflation signal(s)`,
        input.commandData?.manufacturing
          ? `Wastage ${input.commandData.manufacturing.wastagePct.toFixed(1)}%`
          : "Manufacturing variance signals on record",
      ],
    });
  }

  return conflicts;
}

function buildImpactMatrix(decisions: ExecutiveDecision[]): Record<ImpactEffortQuadrant, ExecutiveDecision[]> {
  const matrix: Record<ImpactEffortQuadrant, ExecutiveDecision[]> = {
    "High Impact / Low Effort": [],
    "High Impact / High Effort": [],
    "Low Impact / Low Effort": [],
    "Low Impact / High Effort": [],
  };
  decisions.forEach((row) => {
    matrix[row.quadrant].push(row);
  });
  return matrix;
}

function buildDecisionQueue(decisions: ExecutiveDecision[]): DecisionQueueItem[] {
  return [...decisions]
    .sort(
      (a, b) =>
        URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency] ||
        b.impactScore - a.impactScore ||
        Number(b.opportunityValue || 0) - Number(a.opportunityValue || 0)
    )
    .slice(0, 10)
    .map((row, index) => ({
      id: `queue-${row.id}`,
      priority: index + 1,
      decision: row.decision,
      category: row.category,
      impact: row.expectedImpact,
      confidence: row.confidence,
      suggestedOwner: OWNER_BY_CATEGORY[row.category],
      href: row.href,
    }));
}

function computeConfidenceLevel(decisions: ExecutiveDecision[]): DecisionConfidence {
  if (!decisions.length) return "Low";
  const high = decisions.filter((row) => row.confidence === "High").length;
  if (high / decisions.length >= 0.6) return "High";
  if (high / decisions.length >= 0.3) return "Medium";
  return "Low";
}

function dedupeDecisions(decisions: ExecutiveDecision[]): ExecutiveDecision[] {
  const seen = new Set<string>();
  const result: ExecutiveDecision[] = [];
  for (const row of decisions) {
    const key = `${row.category}:${row.decision}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result.sort(
    (a, b) => URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency] || b.impactScore - a.impactScore
  );
}

export function computeDecisionsSnapshot(input: DecisionsInput): DecisionsSnapshot {
  const rootCauseSnapshot = computeRootCauseSnapshot(input);
  computeEarlyWarningSnapshot(input);
  computePredictiveRiskSnapshot(input);
  computeBusinessHealthSnapshot(input);

  const intelligence = input.intelligence;
  const fromInvestigations = rootCauseSnapshot.investigations.map((row) =>
    investigationToDecision(row, intelligence)
  );
  const fromRepricing = buildRepricingDecisions(intelligence);
  const recommendedDecisions = dedupeDecisions([...fromInvestigations, ...fromRepricing]);

  const opportunityTotal = recommendedDecisions.reduce(
    (sum, row) => sum + Number(row.opportunityValue || 0),
    0
  );
  const riskReductionTotal = recommendedDecisions.reduce(
    (sum, row) => sum + Number(row.riskReductionValue || 0),
    0
  );

  const playbooks = buildPlaybooks(input, recommendedDecisions, intelligence);
  const opportunities = buildOpportunities(intelligence, recommendedDecisions);
  const conflicts = buildConflicts(input, recommendedDecisions);

  return {
    summary: {
      criticalDecisions: recommendedDecisions.filter((row) => row.urgency === "Immediate").length,
      highImpactDecisions: recommendedDecisions.filter(
        (row) => row.urgency === "Immediate" || row.urgency === "High"
      ).length,
      estimatedOpportunity: opportunityTotal > 0 ? Math.round(opportunityTotal) : null,
      opportunityLabel: opportunityTotal > 0 ? money(opportunityTotal) : "Opportunity Not Yet Quantifiable",
      estimatedRiskReduction: riskReductionTotal > 0 ? Math.round(riskReductionTotal) : null,
      riskReductionLabel:
        riskReductionTotal > 0 ? money(riskReductionTotal) : "Opportunity Not Yet Quantifiable",
      confidenceLevel: computeConfidenceLevel(recommendedDecisions),
    },
    recommendedDecisions,
    playbooks,
    impactMatrix: buildImpactMatrix(recommendedDecisions),
    opportunities,
    conflicts,
    decisionQueue: buildDecisionQueue(recommendedDecisions),
    hasDecisionData: rootCauseSnapshot.hasAnalysisData,
  };
}
