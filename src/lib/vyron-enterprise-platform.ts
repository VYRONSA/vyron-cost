import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getFinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";
import { getApprovalMatrix } from "@/lib/vyron-enterprise-approval-matrix";
import { getProcurementDashboardStats } from "@/lib/vyron-procurement";
import { getInventoryDashboardStats } from "@/lib/vyron-inventory";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { getInvoiceRiskFindings, getLeakageFindings } from "@/lib/vyron-leakage-intelligence-data";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getRecoveryAuditSummary } from "@/lib/vyron-cost-recovery-data";

export type ContractRow = {
  id: string;
  supplierName: string;
  title: string;
  contractType: string;
  startDate: string | null;
  endDate: string | null;
  daysToExpiry: number | null;
  status: string;
  renewalAlert: boolean;
  href: string;
};

export type ComplianceMetric = {
  domain: string;
  compliancePct: number;
  openIssues: number;
  status: "Compliant" | "Watch" | "Non-Compliant";
  href: string;
};

export type RiskItem = {
  key: string;
  label: string;
  score: number;
  level: "Low" | "Medium" | "High" | "Critical";
  detail: string;
  href: string;
};

export type FraudAlert = {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  description: string;
  exposure: number;
  href?: string;
};

export type AuditorSearchResult = {
  id: string;
  entityType: string;
  label: string;
  detail: string;
  href: string;
  at: string;
};

function riskLevel(score: number): RiskItem["level"] {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export async function getSupplierContracts(companyId = VYRON_DEFAULT_TENANT_ID): Promise<ContractRow[]> {
  const supabase = getSupabaseAdmin();
  const now = Date.now();

  if (supabase) {
    const { data } = await supabase
      .from("vyron_supplier_contracts")
      .select("id, supplier_name, title, contract_type, start_date, end_date, status, renewal_alert_days, supplier_id, document_id")
      .eq("company_id", companyId)
      .order("end_date", { ascending: true })
      .limit(100);

    if (data?.length) {
      return data.map((c) => {
        const end = c.end_date ? new Date(String(c.end_date)).getTime() : null;
        const days = end ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : null;
        return {
          id: String(c.id),
          supplierName: String(c.supplier_name),
          title: String(c.title),
          contractType: String(c.contract_type),
          startDate: c.start_date as string | null,
          endDate: c.end_date as string | null,
          daysToExpiry: days,
          status: String(c.status),
          renewalAlert: days !== null && days <= Number(c.renewal_alert_days || 30),
          href: c.document_id ? `/document-intelligence/${c.document_id}` : `/supplier-intelligence/${c.supplier_id || ""}`,
        };
      });
    }
  }

  const suppliers = await getSupplierIntelligenceRows();
  return suppliers.slice(0, 8).map((s, i) => {
    const days = 45 - i * 12;
    return {
      id: `contract-${s.id}`,
      supplierName: s.supplier_name,
      title: `${s.category} pricing agreement`,
      contractType: i % 2 === 0 ? "pricing" : "discount",
      startDate: "2025-01-01",
      endDate: new Date(now + days * 86400000).toISOString().slice(0, 10),
      daysToExpiry: days,
      status: days < 30 ? "Renewal Due" : "Active",
      renewalAlert: days <= 30,
      href: s.href,
    };
  });
}

export async function getComplianceDashboard(companyId = VYRON_DEFAULT_TENANT_ID): Promise<ComplianceMetric[]> {
  const supabase = getSupabaseAdmin();
  const [approval, leakage, invoiceRisks] = await Promise.all([
    getApprovalMatrix(companyId),
    getFinanceLeakageCentre(companyId),
    getInvoiceRiskFindings(),
  ]);

  let poCompliance = 88;
  let invCompliance = 82;
  let stockCompliance = 91;
  let prodCompliance = 86;

  if (supabase) {
    const [proc, inv, mfg] = await Promise.all([
      getProcurementDashboardStats(supabase, companyId),
      getInventoryDashboardStats(supabase, companyId),
      getManufacturingDashboardStats(supabase, companyId),
    ]);
    const totalPos = proc.openPos + proc.closedPos + proc.partiallyReceived + 1;
    poCompliance = Math.round(100 - (proc.poVariances / totalPos) * 100);
    invCompliance = Math.round(100 - (inv.lowStockItems / Math.max(inv.itemCount, 1)) * 40);
    prodCompliance = Math.round(100 - mfg.productionVariances * 3);
  }

  const pendingInvoices = invoiceRisks.filter((i) => /pending|investigate/i.test(String(i.review_status || ""))).length;
  invCompliance = Math.max(50, invCompliance - pendingInvoices * 2);

  const metrics: ComplianceMetric[] = [
    { domain: "PO Compliance", compliancePct: Math.min(100, poCompliance), openIssues: approval.summary.find((s) => s.entityType === "purchase_order")?.ruleCount || 0, status: poCompliance >= 85 ? "Compliant" : "Watch", href: "/purchase-orders" },
    { domain: "Invoice Compliance", compliancePct: Math.min(100, invCompliance), openIssues: pendingInvoices, status: invCompliance >= 85 ? "Compliant" : "Watch", href: "/document-intelligence" },
    { domain: "Approval Compliance", compliancePct: 90, openIssues: approval.rules.length, status: "Compliant", href: "/enterprise/approval-matrix" },
    { domain: "Supplier Compliance", compliancePct: Math.max(60, 100 - leakage.leakageRiskScore * 0.4), openIssues: leakage.categories.filter((c) => c.riskLevel !== "Low").length, status: "Watch", href: "/supplier-intelligence" },
    { domain: "Stock Count Compliance", compliancePct: Math.min(100, stockCompliance), openIssues: 0, status: "Compliant", href: "/inventory/counts" },
    { domain: "Production Compliance", compliancePct: Math.min(100, prodCompliance), openIssues: 0, status: prodCompliance >= 80 ? "Compliant" : "Watch", href: "/manufacturing" },
  ];

  return metrics;
}

export async function getRiskCentre(companyId = VYRON_DEFAULT_TENANT_ID): Promise<RiskItem[]> {
  const [leakage, suppliers, approval, findings] = await Promise.all([
    getFinanceLeakageCentre(companyId),
    getSupplierIntelligenceRows(),
    getApprovalMatrix(companyId),
    getLeakageFindings(),
  ]);

  const highRiskSuppliers = suppliers.filter((s) => s.supplier_risk_score >= 60).length;
  const supplierScore = Math.min(100, highRiskSuppliers * 12 + leakage.categories.find((c) => c.key === "supplierInflation")?.monthlyExposure! / 2000 || 20);
  const inventoryScore = Math.min(100, leakage.categories.find((c) => c.key === "inventoryShrinkage")?.monthlyExposure! / 1500 || 15);
  const productionScore = Math.min(100, leakage.categories.find((c) => c.key === "productionWaste")?.monthlyExposure! / 2000 || 10);
  const fraudScore = Math.min(100, findings.filter((f) => /duplicate|split/i.test(String(f.finding_type))).length * 18);
  const approvalScore = Math.min(100, approval.rules.filter((r) => r.thresholdType === "risk").length * 15);

  return [
    { key: "supplier", label: "Supplier Risk", score: Math.round(supplierScore), level: riskLevel(supplierScore), detail: `${highRiskSuppliers} high-risk suppliers`, href: "/supplier-intelligence" },
    { key: "inventory", label: "Inventory Risk", score: Math.round(inventoryScore), level: riskLevel(inventoryScore), detail: "Shrinkage and slow-moving exposure", href: "/inventory/alerts" },
    { key: "production", label: "Production Risk", score: Math.round(productionScore), level: riskLevel(productionScore), detail: "Wastage and variance watch", href: "/manufacturing/variances" },
    { key: "leakage", label: "Financial Leakage Risk", score: leakage.leakageRiskScore, level: leakage.riskLevel as RiskItem["level"], detail: `Exposure ${leakage.totalMonthlyExposure}`, href: "/financial-leakage" },
    { key: "approval", label: "Approval Risk", score: Math.round(approvalScore), level: riskLevel(approvalScore), detail: `${approval.rules.length} active rules`, href: "/enterprise/approval-matrix" },
    { key: "fraud", label: "Fraud Risk", score: Math.round(fraudScore), level: riskLevel(fraudScore), detail: "Duplicate and anomaly patterns", href: "/enterprise/fraud-detection" },
  ];
}

export async function getFraudAlerts(companyId = VYRON_DEFAULT_TENANT_ID): Promise<FraudAlert[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("vyron_fraud_alerts")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data?.length) {
      return data.map((a) => ({
        id: String(a.id),
        alertType: String(a.alert_type),
        severity: String(a.severity),
        title: String(a.title),
        description: String(a.description || ""),
        exposure: Number(a.estimated_exposure || 0),
        href: a.entity_id ? `/financial-leakage/${a.entity_id}` : undefined,
      }));
    }
  }

  const [invoices, findings, suppliers, audit] = await Promise.all([
    getInvoiceRiskFindings(),
    getLeakageFindings(),
    getSupplierIntelligenceRows(),
    getRecoveryAuditSummary(20),
  ]);

  const alerts: FraudAlert[] = [];

  for (const inv of invoices.filter((i) => /duplicate/i.test(String(i.risk_type || ""))).slice(0, 4)) {
    alerts.push({
      id: `dup-${inv.id}`,
      alertType: "duplicate_invoice",
      severity: "critical",
      title: `Duplicate invoice ${inv.invoice_number}`,
      description: `Match risk ${inv.risk_score}% · ${inv.supplier_name}`,
      exposure: Number(inv.invoice_amount || 0),
      href: "/document-intelligence",
    });
  }

  for (const s of suppliers.filter((x) => x.price_movement_percent > 10).slice(0, 3)) {
    alerts.push({
      id: `spike-${s.id}`,
      alertType: "price_spike",
      severity: "high",
      title: `Price spike: ${s.supplier_name}`,
      description: `${s.price_movement_percent.toFixed(1)}% movement`,
      exposure: s.negotiation_opportunity,
      href: s.href,
    });
  }

  for (const f of findings.filter((row) => /unauthorized|unapproved/i.test(String(row.finding_type || ""))).slice(0, 2)) {
    alerts.push({
      id: `unauth-${f.id}`,
      alertType: "unapproved_purchase",
      severity: "high",
      title: String(f.title),
      description: String(f.description || ""),
      exposure: Number(f.estimated_monthly_loss || 0),
      href: `/financial-leakage/${f.id}`,
    });
  }

  if (audit.filter((a) => /override/i.test(a.field_name)).length) {
    alerts.push({
      id: "override-pattern",
      alertType: "repeated_override",
      severity: "medium",
      title: "Repeated approval overrides",
      description: `${audit.filter((a) => /override/i.test(a.field_name)).length} override events in audit trail`,
      exposure: 0,
      href: "/audit-logs",
    });
  }

  const collusion = suppliers.filter((s) => s.duplicate_invoice_risk > 0 && s.price_movement_percent > 8);
  if (collusion.length >= 2) {
    alerts.push({
      id: "collusion",
      alertType: "supplier_collusion",
      severity: "high",
      title: "Supplier collusion indicators",
      description: `${collusion.length} suppliers with duplicate risk and inflation`,
      exposure: collusion.reduce((sum, c) => sum + c.price_variance, 0),
      href: "/supplier-intelligence",
    });
  }

  alerts.push({
    id: "shrinkage",
    alertType: "inventory_shrinkage",
    severity: "medium",
    title: "Inventory shrinkage pattern",
    description: "Theoretical vs actual stock gap widening",
    exposure: findings.filter((f) => /stock|shrink/i.test(String(f.finding_type))).reduce((s, f) => s + Number(f.estimated_monthly_loss || 0), 0),
    href: "/inventory/ledger",
  });

  return alerts;
}

export async function auditorGlobalSearch(query: string, companyId = VYRON_DEFAULT_TENANT_ID): Promise<AuditorSearchResult[]> {
  const supabase = getSupabaseAdmin();
  const term = query.trim().toLowerCase();
  if (!term || !supabase) return [];

  const results: AuditorSearchResult[] = [];

  const [{ data: docs }, { data: pos }, { data: grns }, { data: counts }] = await Promise.all([
    supabase.from("vyron_documents").select("id, document_number, supplier_name, total, created_at").eq("tenant_id", companyId).ilike("supplier_name", `%${term}%`).limit(15),
    supabase.from("vyron_cost_purchase_orders").select("id, po_number, supplier_name_snapshot, total, created_at").eq("company_id", companyId).ilike("supplier_name_snapshot", `%${term}%`).limit(15),
    supabase.from("vyron_cost_goods_receipts").select("id, grn_number, supplier_name_snapshot, received_at").eq("company_id", companyId).ilike("supplier_name_snapshot", `%${term}%`).limit(15),
    supabase.from("vyron_cost_stock_counts").select("id, count_number, status, created_at").eq("company_id", companyId).ilike("count_number", `%${term}%`).limit(10),
  ]);

  for (const d of docs || []) {
    results.push({
      id: String(d.id),
      entityType: "Invoice",
      label: String(d.document_number || d.id),
      detail: `${d.supplier_name} · R${Number(d.total || 0).toLocaleString()}`,
      href: `/document-intelligence/${d.id}`,
      at: String(d.created_at),
    });
  }
  for (const p of pos || []) {
    results.push({
      id: String(p.id),
      entityType: "PO",
      label: String(p.po_number),
      detail: `${p.supplier_name_snapshot} · R${Number(p.total || 0).toLocaleString()}`,
      href: `/purchase-orders/${p.id}`,
      at: String(p.created_at),
    });
  }
  for (const g of grns || []) {
    results.push({
      id: String(g.id),
      entityType: "GRN",
      label: String(g.grn_number),
      detail: String(g.supplier_name_snapshot),
      href: `/purchase-orders/${g.id}`,
      at: String(g.received_at),
    });
  }
  for (const c of counts || []) {
    results.push({
      id: String(c.id),
      entityType: "Stock Count",
      label: String(c.count_number),
      detail: String(c.status),
      href: `/inventory/counts/${c.id}`,
      at: String(c.created_at),
    });
  }

  return results.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
