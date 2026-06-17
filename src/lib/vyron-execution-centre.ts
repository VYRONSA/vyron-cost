import { computeActionsSnapshot } from "@/lib/vyron-actions";
import { computeDecisionsSnapshot, type DecisionOwner, type DecisionsInput } from "@/lib/vyron-decisions";
import { computeRootCauseSnapshot } from "@/lib/vyron-root-cause";

export type ExecutionSourceModule = "actions-centre" | "decisions-centre" | "root-cause-centre";

export type ExecutionWorkflowStatus =
  | "Recommended"
  | "Approved"
  | "In Progress"
  | "Completed"
  | "Cancelled";

export type ExecutionCandidate = {
  sourceModule: ExecutionSourceModule;
  sourceKey: string;
  title: string;
  category: string;
  priority: string;
  owner: string;
  expectedOutcome: string;
  expectedBenefit: number | null;
  href: string;
  sourceTrace: string[];
  dueDate: string | null;
};

export type ExecutionDashboardSummary = {
  recommended: number;
  approved: number;
  inProgress: number;
  completed: number;
  overdue: number;
};

function dueDateFromHorizon(horizon: string): string | null {
  const today = new Date();
  if (horizon === "Immediate") return today.toISOString().slice(0, 10);
  const days = horizon === "7 Days" ? 7 : 30;
  today.setDate(today.getDate() + days);
  return today.toISOString().slice(0, 10);
}

function urgencyToPriority(urgency: string): string {
  if (urgency === "Immediate") return "Critical";
  if (urgency === "High") return "High";
  if (urgency === "Medium") return "Medium";
  return "Low";
}

function ownerForDecision(category: string): DecisionOwner {
  if (category === "Supplier" || category === "Procurement") return "Procurement";
  if (category === "Pricing" || category === "Xero") return "Finance";
  if (category === "Inventory") return "Inventory";
  if (category === "Manufacturing") return "Manufacturing";
  return "Executive";
}

export function collectExecutionCandidates(input: DecisionsInput): ExecutionCandidate[] {
  const actionsSnapshot = computeActionsSnapshot(input);
  const decisionsSnapshot = computeDecisionsSnapshot(input);
  const rootCauseSnapshot = computeRootCauseSnapshot(input);

  const candidates: ExecutionCandidate[] = [];

  actionsSnapshot.pipeline.forEach((row) => {
    candidates.push({
      sourceModule: "actions-centre",
      sourceKey: row.id,
      title: row.action,
      category: row.category,
      priority: row.priority,
      owner: row.owner,
      expectedOutcome: row.expectedOutcome,
      expectedBenefit: row.impactValue,
      href: row.href,
      sourceTrace: row.sourceTrace,
      dueDate: dueDateFromHorizon(row.dueHorizon),
    });
  });

  decisionsSnapshot.recommendedDecisions.forEach((row) => {
    candidates.push({
      sourceModule: "decisions-centre",
      sourceKey: row.id,
      title: row.decision,
      category: row.category,
      priority: urgencyToPriority(row.urgency),
      owner: ownerForDecision(row.category),
      expectedOutcome: row.expectedImpact,
      expectedBenefit: row.opportunityValue,
      href: row.href,
      sourceTrace: row.sourceSignals,
      dueDate: dueDateFromHorizon(row.urgency === "Immediate" ? "Immediate" : row.urgency === "High" ? "7 Days" : "30 Days"),
    });
  });

  rootCauseSnapshot.correctiveActions.forEach((row) => {
    const investigation = rootCauseSnapshot.investigations.find(
      (inv) => inv.rootCause === row.rootCause || inv.recommendedResolution === row.action
    );
    candidates.push({
      sourceModule: "root-cause-centre",
      sourceKey: row.id,
      title: row.action,
      category: investigation?.category || "Data Quality",
      priority: row.priority <= 3 ? "Critical" : "High",
      owner: "Operations",
      expectedOutcome: row.expectedImprovement,
      expectedBenefit: null,
      href: row.href,
      sourceTrace: [row.rootCause, row.action],
      dueDate: dueDateFromHorizon(row.priority <= 3 ? "7 Days" : "30 Days"),
    });
  });

  const seen = new Set<string>();
  return candidates.filter((row) => {
    const key = `${row.sourceModule}:${row.sourceKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function computeExecutionDashboard(
  rows: Array<{ status: ExecutionWorkflowStatus; due_date: string | null }>
): ExecutionDashboardSummary {
  const today = new Date().toISOString().slice(0, 10);
  const activeStatuses: ExecutionWorkflowStatus[] = ["Recommended", "Approved", "In Progress"];

  return {
    recommended: rows.filter((row) => row.status === "Recommended").length,
    approved: rows.filter((row) => row.status === "Approved").length,
    inProgress: rows.filter((row) => row.status === "In Progress").length,
    completed: rows.filter((row) => row.status === "Completed").length,
    overdue: rows.filter(
      (row) =>
        activeStatuses.includes(row.status) &&
        row.due_date != null &&
        row.due_date < today
    ).length,
  };
}

export function sourceModuleLabel(module: ExecutionSourceModule): string {
  if (module === "actions-centre") return "Actions Centre";
  if (module === "decisions-centre") return "Decisions Centre";
  return "Root Cause Centre";
}

export type ExecutionStatusTab =
  | "All"
  | "Recommended"
  | "Approved"
  | "In Progress"
  | "Completed"
  | "Cancelled"
  | "Overdue";

export function isActionOverdue(row: {
  status: ExecutionWorkflowStatus;
  due_date: string | null;
}): boolean {
  if (!row.due_date) return false;
  if (row.status === "Completed" || row.status === "Cancelled") return false;
  return row.due_date < new Date().toISOString().slice(0, 10);
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildExecutionQueueCsv(
  rows: Array<{
    priority: string;
    title: string;
    owner: string;
    status: ExecutionWorkflowStatus;
    due_date: string | null;
    source_module: ExecutionSourceModule;
    expected_outcome: string;
    expected_benefit: number | null;
    actual_benefit: number | null;
    notes: string | null;
  }>
): string {
  const header = [
    "Priority",
    "Action",
    "Owner",
    "Status",
    "Due Date",
    "Source",
    "Expected Outcome",
    "Expected Benefit",
    "Actual Benefit",
    "Notes",
  ];
  const lines = rows.map((row) =>
    [
      row.priority,
      row.title,
      row.owner,
      isActionOverdue(row) ? "Overdue" : row.status,
      row.due_date || "",
      sourceModuleLabel(row.source_module),
      row.expected_outcome,
      row.expected_benefit != null ? String(row.expected_benefit) : "",
      row.actual_benefit != null ? String(row.actual_benefit) : "",
      row.notes || "",
    ]
      .map((cell) => csvEscape(String(cell)))
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}
