import {
  getInvoiceRiskFindings,
  getLeakageFindings,
  InvoiceRiskFinding,
  LeakageFinding,
} from "@/lib/vyron-leakage-intelligence-data";
import { formatMoney } from "@/lib/vyron-cost-data";

export type DuplicateInvoiceMatch = {
  invoice_number: string;
  supplier_name: string;
  invoice_amount: number;
  status: string;
  duplicate_of: string | null;
};

export type RecoveryDrilldown = {
  finding: LeakageFinding;
  isDuplicate: boolean;
  isRecurring: boolean;
  monthlyLoss: number;
  potentialRecovery: number;
  annualRecovery: number | null;
  formula: string;
  cause: string;
  currentState: string;
  recommendedState: string;
  recommendedActions: string[];
  explanationRows: { label: string; value: string }[];
  duplicateExposure?: number;
  duplicateAmount?: number;
  duplicateCount?: number;
  invoiceNumber?: string;
  matchingInvoices?: DuplicateInvoiceMatch[];
  recommendedAction?: string;
  recoverabilityConfidence?: number;
};

function typeText(type: string | null) {
  const value = String(type || "").toLowerCase();
  if (value.includes("supplier") || value.includes("inflation")) return "Supplier price movement";
  if (value.includes("margin")) return "Product margin erosion";
  if (value.includes("duplicate")) return "Duplicate invoice risk";
  if (value.includes("wastage")) return "Wastage above target";
  if (value.includes("branch")) return "Branch overspend";
  if (value.includes("stock")) return "Stock leakage";
  if (value.includes("procurement")) return "Procurement anomaly";
  return "Financial leakage";
}

function isDuplicateFinding(finding: LeakageFinding) {
  const blob = `${finding.finding_type || ""} ${finding.title || ""} ${finding.description || ""}`.toLowerCase();
  return blob.includes("duplicate");
}

function isRecurringFinding(finding: LeakageFinding) {
  const blob = `${finding.description || ""} ${finding.title || ""}`.toLowerCase();
  return /\b(recurring|monthly|annual|per month|every month)\b/.test(blob);
}

function extractInvoiceNumber(finding: LeakageFinding) {
  const blob = `${finding.title || ""} ${finding.description || ""}`;
  const match = blob.match(/\b([A-Z]{2,5}-?\d{3,6}|[A-Z]{2,}-\d+)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function recoverabilityRate(finding: LeakageFinding, invoice?: InvoiceRiskFinding | null) {
  if (invoice?.ai_confidence != null && Number(invoice.ai_confidence) > 0) {
    return Math.min(1, Number(invoice.ai_confidence) / 100);
  }
  return recoveryRate(finding);
}

function recoveryRate(finding: LeakageFinding) {
  const type = String(finding.finding_type || "").toLowerCase();
  const severity = String(finding.severity || "").toLowerCase();

  if (type.includes("duplicate")) return 1;
  if (type.includes("supplier") || type.includes("inflation")) return 0.65;
  if (type.includes("margin")) return 0.85;
  if (type.includes("wastage")) return 0.7;
  if (type.includes("branch")) return 0.6;
  if (severity.includes("critical")) return 0.85;
  if (severity.includes("high")) return 0.75;
  return 0.6;
}

function formulaFor(finding: LeakageFinding, isDuplicate: boolean) {
  if (isDuplicate) {
    return "Potential Recovery = duplicate invoice amount × recoverability confidence";
  }

  const type = String(finding.finding_type || "").toLowerCase();

  if (type.includes("supplier") || type.includes("inflation")) {
    return "Potential Recovery = Supplier price increase exposure × expected negotiable recovery rate";
  }

  if (type.includes("margin")) {
    return "Potential Recovery = GP shortfall value × monthly sales exposure";
  }

  if (type.includes("wastage")) {
    return "Potential Recovery = Excess wastage value × controllable recovery rate";
  }

  if (type.includes("branch")) {
    return "Potential Recovery = Branch overspend above benchmark × recovery rate";
  }

  return "Potential Recovery = Estimated monthly leakage × realistic recovery rate";
}

function findDuplicateCluster(
  finding: LeakageFinding,
  invoiceRisks: InvoiceRiskFinding[]
): { primary: InvoiceRiskFinding | null; cluster: InvoiceRiskFinding[] } {
  const invoiceNumber = extractInvoiceNumber(finding);
  const supplier = String(finding.supplier_name || "").toLowerCase();

  let primary =
    invoiceRisks.find((row) => invoiceNumber && String(row.invoice_number || "").toUpperCase() === invoiceNumber) ||
    null;

  if (!primary && supplier) {
    primary =
      invoiceRisks.find(
        (row) =>
          String(row.supplier_name || "").toLowerCase() === supplier &&
          /duplicate/i.test(String(row.risk_type || ""))
      ) || null;
  }

  if (!primary) {
    const duplicates = invoiceRisks.filter((row) => /duplicate/i.test(String(row.risk_type || "")));
    if (duplicates.length) primary = duplicates[0];
  }

  if (!primary) return { primary: null, cluster: [] };

  const clusterIds = new Set<string>([primary.id]);
  const cluster = [primary];

  for (const row of invoiceRisks) {
    if (clusterIds.has(row.id)) continue;
    const matchesPrimary =
      String(row.duplicate_of || "").toUpperCase() === String(primary.invoice_number || "").toUpperCase() ||
      String(primary.duplicate_of || "").toUpperCase() === String(row.invoice_number || "").toUpperCase() ||
      (row.duplicate_of &&
        primary.duplicate_of &&
        String(row.duplicate_of).toUpperCase() === String(primary.duplicate_of).toUpperCase());

    const sameSupplierAmount =
      String(row.supplier_name || "").toLowerCase() === String(primary.supplier_name || "").toLowerCase() &&
      Number(row.invoice_amount || 0) > 0 &&
      Number(row.invoice_amount) === Number(primary.invoice_amount);

    if (matchesPrimary || (sameSupplierAmount && /duplicate/i.test(String(row.risk_type || "")))) {
      cluster.push(row);
      clusterIds.add(row.id);
    }
  }

  return { primary, cluster };
}

function buildDuplicateDrilldown(
  finding: LeakageFinding,
  invoiceRisks: InvoiceRiskFinding[]
): RecoveryDrilldown {
  const { primary, cluster } = findDuplicateCluster(finding, invoiceRisks);
  const duplicateAmount = Number(primary?.invoice_amount || finding.estimated_monthly_loss || 0);
  const confidence = recoverabilityRate(finding, primary);
  const potentialRecovery = duplicateAmount * confidence;
  const duplicateExposure = duplicateAmount;
  const invoiceNumber = primary?.invoice_number || extractInvoiceNumber(finding) || "—";
  const matchingInvoices: DuplicateInvoiceMatch[] = (cluster.length ? cluster : primary ? [primary] : []).map(
    (row) => ({
      invoice_number: row.invoice_number || "—",
      supplier_name: row.supplier_name || finding.supplier_name || "—",
      invoice_amount: Number(row.invoice_amount || 0),
      status: row.review_status || finding.status || "Pending Review",
      duplicate_of: row.duplicate_of,
    })
  );

  const recommendedAction =
    "Block payment, confirm duplicate match, and recover or void the duplicate invoice before release.";

  return {
    finding,
    isDuplicate: true,
    isRecurring: false,
    monthlyLoss: 0,
    potentialRecovery,
    annualRecovery: null,
    formula: formulaFor(finding, true),
    cause: "Duplicate invoice risk",
    currentState:
      "This is a once-off duplicate invoice risk. It should be reviewed and blocked or recovered before payment.",
    recommendedState: `Duplicate invoice exposure of ${formatMoney(duplicateExposure)} with ${formatMoney(potentialRecovery)} potentially recoverable at ${(confidence * 100).toFixed(0)}% confidence.`,
    recommendedActions: [
      recommendedAction,
      "Open matching invoice documents and confirm supplier, amount and invoice numbers.",
      "Mark as blocked if confirmed duplicate; route recovery if payment already posted.",
      "Update AP controls to prevent repeat submission.",
    ],
    explanationRows: [
      { label: "Duplicate invoice exposure", value: formatMoney(duplicateExposure) },
      { label: "Duplicate amount", value: formatMoney(duplicateAmount) },
      { label: "Potential recoverable amount", value: formatMoney(potentialRecovery) },
      { label: "Duplicate count", value: String(Math.max(1, cluster.length || matchingInvoices.length)) },
      { label: "Supplier", value: finding.supplier_name || primary?.supplier_name || "—" },
      { label: "Invoice number", value: invoiceNumber },
      { label: "Recoverability confidence", value: `${(confidence * 100).toFixed(0)}%` },
      { label: "Status", value: finding.status || primary?.review_status || "Investigate" },
      { label: "Recommended action", value: recommendedAction },
    ],
    duplicateExposure,
    duplicateAmount,
    duplicateCount: Math.max(1, cluster.length || matchingInvoices.length),
    invoiceNumber,
    matchingInvoices,
    recommendedAction,
    recoverabilityConfidence: confidence,
  };
}

function buildRecurringDrilldown(finding: LeakageFinding): RecoveryDrilldown {
  const monthlyLoss = Number(finding.estimated_monthly_loss || 0);
  const rate = recoveryRate(finding);
  const potentialRecovery = monthlyLoss * rate;
  const annualRecovery = potentialRecovery * 12;
  const cause = typeText(finding.finding_type);
  const branchOrCategory = finding.branch_name || finding.category_name || "Main production operation";
  const supplier = finding.supplier_name || "No single supplier linked";
  const recurring = isRecurringFinding(finding);

  return {
    finding,
    isDuplicate: false,
    isRecurring: recurring,
    monthlyLoss,
    potentialRecovery,
    annualRecovery: recurring ? annualRecovery : null,
    formula: formulaFor(finding, false),
    cause,
    currentState: `${cause} detected in ${branchOrCategory}. Estimated monthly leakage is ${formatMoney(monthlyLoss)}.`,
    recommendedState: recurring
      ? `Target recovery is ${formatMoney(potentialRecovery)} per month / ${formatMoney(annualRecovery || 0)} per year.`
      : `Target recovery is ${formatMoney(potentialRecovery)} based on current exposure.`,
    recommendedActions: [
      "Open the linked product, supplier, invoice or branch record.",
      "Confirm whether the leakage is valid or false positive.",
      "Approve the recommended price, supplier, wastage or invoice action.",
      "Track recovered value after action is implemented.",
    ],
    explanationRows: [
      { label: "Leakage type", value: finding.finding_type || "Financial leakage" },
      { label: "Supplier", value: supplier },
      { label: "Branch / category", value: branchOrCategory },
      { label: "Severity", value: finding.severity || "Medium" },
      { label: "Estimated monthly leakage", value: formatMoney(monthlyLoss) },
      { label: "Recovery rate used", value: `${(rate * 100).toFixed(0)}%` },
      { label: "Potential monthly recovery", value: formatMoney(potentialRecovery) },
      ...(recurring
        ? [{ label: "Potential annual recovery", value: formatMoney(annualRecovery) }]
        : []),
    ],
  };
}

export async function getRecoveryDrilldown(id: string): Promise<RecoveryDrilldown | null> {
  const [findings, invoiceRisks] = await Promise.all([getLeakageFindings(), getInvoiceRiskFindings()]);
  const finding =
    findings.find((item) => item.id === id) ||
    findings.find((item) => String(item.id).toLowerCase() === String(id).toLowerCase());

  if (!finding) return null;

  if (isDuplicateFinding(finding)) {
    return buildDuplicateDrilldown(finding, invoiceRisks);
  }

  return buildRecurringDrilldown(finding);
}
