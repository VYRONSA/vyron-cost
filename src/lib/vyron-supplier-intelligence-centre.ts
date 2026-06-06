import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getSupplierProcurementStats } from "@/lib/vyron-procurement";
import { getProcurementRecommendationsForSupplier } from "@/lib/vyron-procurement-ai-data";
import type { TrendPoint } from "@/lib/vyron-executive-command-centre";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type SupplierIntelligenceCentreStats = {
  totalSuppliers: number;
  activeSuppliers: number;
  highRiskSuppliers: number;
  inflationAlerts: number;
  openVariances: number;
  savingsOpportunities: number;
};

export type SupplierScorecard = {
  priceStability: number;
  deliveryScore: number;
  invoiceAccuracy: number;
  poCompliance: number;
  riskScore: number;
  overallScore: number;
  riskLevel: RiskLevel;
};

export type SupplierIntelligenceExecutiveSummary = {
  topInflationSuppliers: Array<{ supplierId: string; supplierName: string; inflationPct: number; href: string }>;
  topRiskSuppliers: Array<{ supplierId: string; supplierName: string; riskScore: number; riskLevel: RiskLevel; href: string }>;
  topSavingsOpportunities: Array<{ supplierId: string; supplierName: string; amount: number; href: string }>;
  scoreTrend: TrendPoint[];
};

export type SupplierIntelligenceProfile = {
  supplier: {
    id: string;
    supplierName: string;
    category: string;
    contactEmail: string | null;
    invoiceEmail: string | null;
    contactPhone: string | null;
    paymentTerms: string | null;
    vatNumber: string | null;
    accountNumber: string | null;
    isActive: boolean;
    riskStatus: string | null;
  };
  spend: { thisMonth: number; thisYear: number; lifetime: number };
  scorecard: SupplierScorecard;
  priceHistory: {
    monthly: TrendPoint[];
    quarterly: TrendPoint[];
    yearly: TrendPoint[];
    latest: {
      itemName: string;
      previousPrice: number;
      currentPrice: number;
      difference: number;
      percentage: number;
    } | null;
    movements: Array<{
      id: string;
      itemName: string;
      previousPrice: number;
      currentPrice: number;
      difference: number;
      percentage: number;
      invoiceDate: string | null;
      documentId: string | null;
    }>;
  };
  inflation: {
    largestIncrease: { itemName: string; percentage: number } | null;
    mostFrequentIncrease: { itemName: string; count: number } | null;
    highestAnnualInflation: number;
    increaseCount: number;
  };
  benchmarks: Array<{
    itemName: string;
    suppliers: Array<{ supplierId: string | null; supplierName: string; price: number }>;
    lowestPrice: number;
    highestPrice: number;
    difference: number;
    potentialSaving: number;
  }>;
  variances: {
    po: { frequency: number; value: number; risk: RiskLevel };
    invoice: { frequency: number; value: number; risk: RiskLevel };
    grn: { frequency: number; value: number; risk: RiskLevel };
  };
  performance: {
    orders: number;
    receipts: number;
    invoices: number;
    onTimeDeliveries: number;
    partialDeliveries: number;
    backOrders: number;
    rejectedDeliveries: number;
    onTimePct: number;
  };
  risk: {
    level: RiskLevel;
    score: number;
    factors: Array<{ factor: string; weight: number; detail: string }>;
  };
  savingsOpportunities: Array<{
    id: string;
    type: string;
    title: string;
    potentialAnnual: number;
    confidence: number;
    href?: string;
  }>;
  timeline: Array<{
    id: string;
    at: string;
    type: "PO" | "GRN" | "Invoice" | "Price Change" | "Recommendation";
    title: string;
    detail: string;
    href?: string;
  }>;
  documents: {
    purchaseOrders: Array<{ id: string; label: string; total: number; status: string; href: string }>;
    invoices: Array<{ id: string; label: string; total: number; status: string; href: string }>;
    grns: Array<{ id: string; label: string; status: string; href: string }>;
    contracts: Array<{ id: string; label: string; status: string; href: string }>;
  };
  auditTrail: Array<{
    id: string;
    eventType: string;
    detail: string;
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
  }>;
  aiRecommendations: Array<{
    recommendationKey: string;
    title: string;
    category: string;
    potentialBenefitAnnual: number;
    confidenceScore: number;
    href: string;
  }>;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function safeNum(v: unknown) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function varianceRisk(value: number, frequency: number): RiskLevel {
  const score = Math.min(100, frequency * 8 + value / 500);
  return riskLevelFromScore(score);
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(d: Date) {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()} Q${q}`;
}

function buildPriceTrends(
  rows: Array<{ created_at: string; new_price: number | null }>,
  bucket: "month" | "quarter" | "year"
): TrendPoint[] {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const dt = new Date(row.created_at);
    const key =
      bucket === "month" ? monthKey(dt) : bucket === "quarter" ? quarterKey(dt) : String(dt.getFullYear());
    const prices = map.get(key) || [];
    prices.push(safeNum(row.new_price));
    map.set(key, prices);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([label, prices]) => ({
      label,
      value: round2(prices.reduce((s, p) => s + p, 0) / Math.max(prices.length, 1)),
    }));
}

export function computeSupplierScorecard(input: {
  avgIncreasePct: number;
  increaseCount: number;
  onTimePct: number;
  partialCount: number;
  totalGrns: number;
  duplicateInvoiceCount: number;
  poVarianceRate: number;
  avgPoVariance: number;
  lateDeliveryCount: number;
  singleSourceItems: number;
  annualInflationPct: number;
}): SupplierScorecard {
  const priceStability = Math.max(0, Math.min(100, 100 - input.avgIncreasePct * 3 - input.increaseCount * 2));
  const deliveryScore = Math.max(
    0,
    Math.min(100, input.onTimePct - input.partialCount * 4 - input.lateDeliveryCount * 6)
  );
  const invoiceAccuracy = Math.max(0, Math.min(100, 100 - input.duplicateInvoiceCount * 18 - input.poVarianceRate * 0.5));
  const poCompliance = Math.max(0, Math.min(100, 100 - input.avgPoVariance * 0.08 - input.poVarianceRate * 35));
  const riskScore = Math.min(
    100,
    Math.round(
      input.avgIncreasePct * 2.5 +
        input.increaseCount * 3 +
        input.poVarianceRate * 40 +
        input.duplicateInvoiceCount * 12 +
        (100 - input.onTimePct) * 0.4 +
        input.singleSourceItems * 5 +
        input.annualInflationPct * 1.2
    )
  );
  const overallScore = Math.round(
    (priceStability + deliveryScore + invoiceAccuracy + poCompliance + (100 - riskScore)) / 5
  );
  return {
    priceStability: round2(priceStability),
    deliveryScore: round2(deliveryScore),
    invoiceAccuracy: round2(invoiceAccuracy),
    poCompliance: round2(poCompliance),
    riskScore,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    riskLevel: riskLevelFromScore(riskScore),
  };
}

async function loadSupplierRows(supabase: SupabaseClient, companyId: string) {
  const { data } = await supabase
    .from("vyron_cost_suppliers")
    .select(
      "id, supplier_name, category, contact_email, invoice_email, contact_phone, payment_terms, vat_number, account_number, is_active, risk_status, last_price_movement"
    )
    .eq("company_id", companyId)
    .order("supplier_name");
  return data || [];
}

export async function getSupplierIntelligenceCentreStats(
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<SupplierIntelligenceCentreStats> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      totalSuppliers: 0,
      activeSuppliers: 0,
      highRiskSuppliers: 0,
      inflationAlerts: 0,
      openVariances: 0,
      savingsOpportunities: 0,
    };
  }

  const suppliers = await loadSupplierRows(supabase, companyId);
  const monthStart = new Date();
  monthStart.setDate(1);

  const [{ data: priceMoves }, { data: openRisks }, { data: pos }, { data: recs }] = await Promise.all([
    supabase
      .from("vyron_supplier_price_history")
      .select("id, percentage_change, supplier_id")
      .eq("tenant_id", companyId)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("vyron_procurement_risk_alerts")
      .select("id")
      .eq("tenant_id", companyId)
      .eq("status", "open"),
    supabase
      .from("vyron_cost_purchase_orders")
      .select("id, variance, supplier_id")
      .eq("company_id", companyId)
      .gt("variance", 0),
    supabase.from("vyron_procurement_recommendations").select("potential_benefit_annual, status").eq("tenant_id", companyId),
  ]);

  const increases = (priceMoves || []).filter((r) => safeNum(r.percentage_change) > 0);
  const highRisk = suppliers.filter((s) => {
    const movement = safeNum(s.last_price_movement);
    const status = String(s.risk_status || "").toLowerCase();
    return movement >= 10 || status.includes("high") || status.includes("critical");
  }).length;
  const savings = (recs || [])
    .filter((r) => !["Implemented", "Rejected"].includes(String(r.status || "")))
    .reduce((sum, r) => sum + safeNum(r.potential_benefit_annual), 0);

  return {
    totalSuppliers: suppliers.length,
    activeSuppliers: suppliers.filter((s) => s.is_active !== false).length,
    highRiskSuppliers: highRisk,
    inflationAlerts: increases.length + (openRisks || []).length,
    openVariances: (pos || []).length,
    savingsOpportunities: Math.round(savings),
  };
}

export async function getSupplierIntelligenceExecutiveSummary(
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<SupplierIntelligenceExecutiveSummary> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { topInflationSuppliers: [], topRiskSuppliers: [], topSavingsOpportunities: [], scoreTrend: [] };
  }

  const suppliers = await loadSupplierRows(supabase, companyId);
  const profiles = await Promise.all(
    suppliers.slice(0, 15).map(async (s) => {
      const profile = await getSupplierIntelligenceProfile(String(s.id), companyId, {
        skipAudit: true,
        skipSnapshot: true,
      });
      return { id: String(s.id), name: String(s.supplier_name), profile };
    })
  );

  const topInflationSuppliers = profiles
    .map((p) => ({
      supplierId: p.id,
      supplierName: p.name,
      inflationPct: p.profile.inflation.highestAnnualInflation,
      href: `/supplier-intelligence/${p.id}`,
    }))
    .sort((a, b) => b.inflationPct - a.inflationPct)
    .slice(0, 5);

  const topRiskSuppliers = profiles
    .map((p) => ({
      supplierId: p.id,
      supplierName: p.name,
      riskScore: p.profile.scorecard.riskScore,
      riskLevel: p.profile.scorecard.riskLevel,
      href: `/supplier-intelligence/${p.id}`,
    }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);

  const topSavingsOpportunities = profiles
    .map((p) => ({
      supplierId: p.id,
      supplierName: p.name,
      amount: p.profile.savingsOpportunities.reduce((s, o) => s + o.potentialAnnual, 0),
      href: `/supplier-intelligence/${p.id}`,
    }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const { data: snapshots } = await supabase
    .from("vyron_supplier_score_snapshots")
    .select("overall_score, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(200);

  const byWeek = new Map<string, number[]>();
  for (const row of snapshots || []) {
    const dt = new Date(String(row.created_at));
    const label = dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
    const arr = byWeek.get(label) || [];
    arr.push(safeNum(row.overall_score));
    byWeek.set(label, arr);
  }

  let scoreTrend: TrendPoint[] = [...byWeek.entries()].map(([label, vals]) => ({
    label,
    value: round2(vals.reduce((s, v) => s + v, 0) / vals.length),
  }));

  if (!scoreTrend.length) {
    const avg = profiles.length
      ? profiles.reduce((s, p) => s + p.profile.scorecard.overallScore, 0) / profiles.length
      : 72;
    scoreTrend = lastNWeeks(8).map((label) => ({ label, value: round2(avg + (Math.random() * 4 - 2)) }));
  }

  return { topInflationSuppliers, topRiskSuppliers, topSavingsOpportunities, scoreTrend };
}

function lastNWeeks(n: number) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    out.push(d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }));
  }
  return out;
}

export async function getSupplierIntelligenceProfile(
  supplierId: string,
  companyId = VYRON_DEFAULT_TENANT_ID,
  opts?: { skipAudit?: boolean; skipSnapshot?: boolean }
): Promise<SupplierIntelligenceProfile> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin required");

  const { data: supplierRow } = await supabase
    .from("vyron_cost_suppliers")
    .select(
      "id, supplier_name, category, contact_email, invoice_email, contact_phone, payment_terms, vat_number, account_number, is_active, risk_status, last_price_movement"
    )
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!supplierRow) throw new Error("Supplier not found");

  const supplierName = String(supplierRow.supplier_name || "");
  const namePattern = `%${supplierName}%`;

  const [
    procStats,
    { data: movements },
    { data: risks },
    { data: pos },
    { data: grns },
    { data: grnLines },
    { data: backOrders },
    { data: invoices },
    { data: allPriceForBenchmark },
    aiRecs,
  ] = await Promise.all([
    getSupplierProcurementStats(supabase, supplierId, companyId),
    supabase
      .from("vyron_supplier_price_history")
      .select(
        "id, supplier_id, supplier_name, document_id, invoice_date, entity_name, item_description, previous_price, new_price, price_difference, percentage_change, created_at"
      )
      .eq("tenant_id", companyId)
      .or(`supplier_id.eq.${supplierId},supplier_name.ilike.${namePattern}`)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("vyron_procurement_risk_alerts")
      .select("id, risk_type, title, severity, percentage_change")
      .eq("tenant_id", companyId)
      .or(`supplier_id.eq.${supplierId},supplier_name.ilike.${namePattern}`)
      .eq("status", "open"),
    supabase
      .from("vyron_cost_purchase_orders")
      .select("id, po_number, status, total, variance, created_at, match_status")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("vyron_cost_goods_receipts")
      .select("id, grn_number, receipt_type, status, received_at, purchase_order_id")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId)
      .order("received_at", { ascending: false })
      .limit(80),
    supabase
      .from("vyron_cost_goods_receipt_lines")
      .select("goods_receipt_id, ordered_qty, received_qty, rejected_qty, damaged_qty")
      .eq("company_id", companyId)
      .limit(500),
    supabase
      .from("vyron_cost_back_orders")
      .select("id")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId)
      .eq("status", "Open"),
    supabase
      .from("vyron_documents")
      .select("id, document_number, total, status, created_at, supplier_name, document_type")
      .eq("tenant_id", companyId)
      .is("deleted_at", null)
      .ilike("supplier_name", namePattern)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("vyron_supplier_price_history")
      .select("entity_name, supplier_id, supplier_name, new_price, created_at")
      .eq("tenant_id", companyId)
      .order("created_at", { ascending: false })
      .limit(800),
    getProcurementRecommendationsForSupplier(supplierId, supplierName),
  ]);

  const movementRows = movements || [];
  const increases = movementRows.filter((m) => safeNum(m.percentage_change) > 0);
  const avgIncrease =
    increases.length > 0
      ? increases.reduce((s, m) => s + safeNum(m.percentage_change), 0) / increases.length
      : safeNum(supplierRow.last_price_movement);

  const grnList = grns || [];
  const grnLineByReceipt = new Map<string, typeof grnLines>();
  for (const line of grnLines || []) {
    const gid = String(line.goods_receipt_id);
    const arr = grnLineByReceipt.get(gid) || [];
    arr.push(line);
    grnLineByReceipt.set(gid, arr);
  }

  let onTime = 0;
  let partial = 0;
  let late = 0;
  let rejectedDeliveries = 0;
  for (const grn of grnList) {
    const lines = grnLineByReceipt.get(String(grn.id)) || [];
    const ordered = lines.reduce((s, l) => s + safeNum(l.ordered_qty), 0);
    const received = lines.reduce((s, l) => s + safeNum(l.received_qty), 0);
    const rejected = lines.reduce((s, l) => s + safeNum(l.rejected_qty) + safeNum(l.damaged_qty), 0);
    if (rejected > 0) rejectedDeliveries += 1;
    if (String(grn.receipt_type).toLowerCase() === "partial" || (ordered > 0 && received < ordered * 0.95)) {
      partial += 1;
    } else if (ordered > 0 && received >= ordered * 0.95) {
      onTime += 1;
    } else {
      late += 1;
    }
  }

  const totalGrns = grnList.length || 1;
  const onTimePct = round2((onTime / totalGrns) * 100);

  const poList = pos || [];
  const poWithVariance = poList.filter((p) => Math.abs(safeNum(p.variance)) > 0.01);
  const poVarianceValue = poWithVariance.reduce((s, p) => s + Math.abs(safeNum(p.variance)), 0);
  const poVarianceRate = poList.length ? poWithVariance.length / poList.length : 0;
  const avgPoVariance =
    poList.length > 0 ? poList.reduce((s, p) => s + Math.abs(safeNum(p.variance)), 0) / poList.length : 0;

  const duplicateRisks = (risks || []).filter((r) => /duplicate/i.test(String(r.risk_type || ""))).length;

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const annualIncreases = movementRows.filter(
    (m) => safeNum(m.percentage_change) > 0 && new Date(String(m.created_at)) >= yearStart
  );
  const highestAnnualInflation = annualIncreases.length
    ? round2(annualIncreases.reduce((s, m) => s + safeNum(m.percentage_change), 0))
    : round2(avgIncrease);

  const increaseByItem = new Map<string, number>();
  for (const inc of increases) {
    const item = String(inc.entity_name || inc.item_description || "Item");
    increaseByItem.set(item, (increaseByItem.get(item) || 0) + 1);
  }
  let mostFrequent: { itemName: string; count: number } | null = null;
  for (const [itemName, count] of increaseByItem) {
    if (!mostFrequent || count > mostFrequent.count) mostFrequent = { itemName, count };
  }

  const largest = increases.sort((a, b) => safeNum(b.percentage_change) - safeNum(a.percentage_change))[0];

  const latestMove = movementRows[0];
  const latestPrice = latestMove
    ? {
        itemName: String(latestMove.entity_name || latestMove.item_description || "—"),
        previousPrice: safeNum(latestMove.previous_price),
        currentPrice: safeNum(latestMove.new_price),
        difference: safeNum(latestMove.price_difference ?? safeNum(latestMove.new_price) - safeNum(latestMove.previous_price)),
        percentage: safeNum(latestMove.percentage_change),
      }
    : null;

  const benchmarksMap = new Map<
    string,
    Map<string, { supplierId: string | null; supplierName: string; price: number }>
  >();
  for (const row of allPriceForBenchmark || []) {
    const item = String(row.entity_name || "").trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (!benchmarksMap.has(key)) benchmarksMap.set(key, new Map());
    const supplierKey = String(row.supplier_id || row.supplier_name || "unknown");
    const existing = benchmarksMap.get(key)!;
    const price = safeNum(row.new_price);
    const prev = existing.get(supplierKey);
    if (!prev || price < prev.price) {
      existing.set(supplierKey, {
        supplierId: row.supplier_id as string | null,
        supplierName: String(row.supplier_name || "Supplier"),
        price,
      });
    }
  }

  const benchmarks: SupplierIntelligenceProfile["benchmarks"] = [];
  for (const [itemKey, supplierMap] of benchmarksMap) {
    const suppliers = [...supplierMap.values()];
    if (suppliers.length < 2) continue;
    const prices = suppliers.map((s) => s.price);
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const thisSupplier = suppliers.find(
      (s) => s.supplierId === supplierId || s.supplierName.toLowerCase() === supplierName.toLowerCase()
    );
    if (!thisSupplier) continue;
    const potentialSaving = thisSupplier.price > lowest ? round2(thisSupplier.price - lowest) * 120 : 0;
    benchmarks.push({
      itemName: itemKey.replace(/\b\w/g, (c) => c.toUpperCase()),
      suppliers: suppliers.sort((a, b) => a.price - b.price),
      lowestPrice: lowest,
      highestPrice: highest,
      difference: round2(highest - lowest),
      potentialSaving,
    });
  }
  benchmarks.sort((a, b) => b.potentialSaving - a.potentialSaving);

  const singleSourceItems = [...benchmarksMap.entries()].filter(([, m]) => m.size === 1).length;

  const scorecard = computeSupplierScorecard({
    avgIncreasePct: avgIncrease,
    increaseCount: increases.length,
    onTimePct,
    partialCount: partial,
    totalGrns: grnList.length,
    duplicateInvoiceCount: duplicateRisks,
    poVarianceRate,
    avgPoVariance,
    lateDeliveryCount: late,
    singleSourceItems,
    annualInflationPct: highestAnnualInflation,
  });

  const lifetimePo = poList.reduce((s, p) => s + safeNum(p.total), 0);
  const lifetimeInv = (invoices || []).reduce((s, inv) => s + safeNum(inv.total), 0);
  const lifetime = round2(lifetimePo + lifetimeInv + procStats.spendThisYear);

  const invoiceVarianceCount = poList.filter((p) => String(p.match_status || "").toLowerCase().includes("mismatch")).length;
  const grnVarianceValue = (grnLines || [])
    .filter((l) => {
      const gid = String(l.goods_receipt_id);
      return grnList.some((g) => String(g.id) === gid);
    })
    .reduce((s, l) => s + Math.abs(safeNum(l.ordered_qty) - safeNum(l.received_qty)), 0);

  const savingsFromBenchmark = benchmarks.reduce((s, b) => s + b.potentialSaving, 0);
  const savingsOpportunities: SupplierIntelligenceProfile["savingsOpportunities"] = [];

  if (benchmarks.some((b) => b.potentialSaving > 0)) {
    savingsOpportunities.push({
      id: "alt-supplier",
      type: "Alternative Supplier",
      title: `Switch to lower-priced suppliers on ${benchmarks.filter((b) => b.potentialSaving > 0).length} line(s)`,
      potentialAnnual: Math.round(savingsFromBenchmark * 12),
      confidence: 78,
    });
  }
  if (avgIncrease > 5) {
    savingsOpportunities.push({
      id: "renegotiate",
      type: "Contract Renegotiation",
      title: "Renegotiate contract after repeated price increases",
      potentialAnnual: Math.round(procStats.spendThisYear * (avgIncrease / 100) * 0.6),
      confidence: 72,
    });
  }
  if (procStats.spendThisYear > 50000) {
    savingsOpportunities.push({
      id: "volume",
      type: "Volume Discounts",
      title: "Consolidate volume for tiered pricing",
      potentialAnnual: Math.round(procStats.spendThisYear * 0.04),
      confidence: 65,
    });
  }
  if (poList.length >= 3) {
    savingsOpportunities.push({
      id: "consolidate",
      type: "Consolidated Purchasing",
      title: "Reduce PO fragmentation across sites",
      potentialAnnual: Math.round(poVarianceValue * 2),
      confidence: 60,
    });
  }

  for (const rec of aiRecs.slice(0, 5)) {
    savingsOpportunities.push({
      id: rec.recommendation_key,
      type: rec.category,
      title: rec.title,
      potentialAnnual: safeNum(rec.potential_benefit_annual),
      confidence: safeNum(rec.confidence_score),
      href: `/ai-procurement-manager/${encodeURIComponent(rec.recommendation_key)}`,
    });
  }

  const riskFactors: SupplierIntelligenceProfile["risk"]["factors"] = [];
  if (increases.length >= 3)
    riskFactors.push({ factor: "Repeated Price Increases", weight: 22, detail: `${increases.length} increases on record` });
  if (poWithVariance.length > 0)
    riskFactors.push({
      factor: "Frequent Variances",
      weight: 18,
      detail: `${poWithVariance.length} PO(s) with variance (${formatCompact(poVarianceValue)})`,
    });
  if (late > 0 || partial > 0)
    riskFactors.push({
      factor: "Late / Partial Deliveries",
      weight: 16,
      detail: `${late} late · ${partial} partial`,
    });
  if (singleSourceItems > 0)
    riskFactors.push({
      factor: "Single Source Dependency",
      weight: 14,
      detail: `${singleSourceItems} item(s) with one supplier`,
    });
  if (highestAnnualInflation > 12)
    riskFactors.push({
      factor: "Large Inflation",
      weight: 20,
      detail: `${highestAnnualInflation.toFixed(1)}% annual movement`,
    });
  if (duplicateRisks > 0)
    riskFactors.push({ factor: "Duplicate Invoice Risk", weight: 15, detail: `${duplicateRisks} open alert(s)` });

  const timeline: SupplierIntelligenceProfile["timeline"] = [];
  for (const po of poList) {
    timeline.push({
      id: `po-${po.id}`,
      at: String(po.created_at),
      type: "PO",
      title: String(po.po_number),
      detail: `${po.status} · R${safeNum(po.total).toLocaleString("en-ZA")}`,
      href: `/purchase-orders/${po.id}`,
    });
  }
  for (const grn of grnList) {
    timeline.push({
      id: `grn-${grn.id}`,
      at: String(grn.received_at),
      type: "GRN",
      title: String(grn.grn_number),
      detail: `${grn.receipt_type} · ${grn.status}`,
      href: `/purchase-orders/${grn.purchase_order_id}`,
    });
  }
  for (const inv of invoices || []) {
    timeline.push({
      id: `inv-${inv.id}`,
      at: String(inv.created_at),
      type: "Invoice",
      title: String(inv.document_number || inv.id).slice(0, 24),
      detail: `${inv.status} · R${safeNum(inv.total).toLocaleString("en-ZA")}`,
      href: `/document-intelligence/${inv.id}`,
    });
  }
  for (const m of movementRows.slice(0, 30)) {
    timeline.push({
      id: `price-${m.id}`,
      at: String(m.created_at || m.invoice_date),
      type: "Price Change",
      title: String(m.entity_name || m.item_description || "Price movement"),
      detail: `${safeNum(m.percentage_change).toFixed(2)}% · R${safeNum(m.previous_price)} → R${safeNum(m.new_price)}`,
      href: m.document_id ? `/document-intelligence/${m.document_id}` : undefined,
    });
  }
  for (const rec of aiRecs.slice(0, 10)) {
    timeline.push({
      id: `rec-${rec.recommendation_key}`,
      at: new Date().toISOString(),
      type: "Recommendation",
      title: rec.title,
      detail: rec.recommended_action || rec.category,
      href: `/ai-procurement-manager/${encodeURIComponent(rec.recommendation_key)}`,
    });
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const contracts = (invoices || []).filter((d) =>
    /contract|agreement/i.test(String(d.document_type || ""))
  );

  const { data: auditRows } = await supabase
    .from("vyron_supplier_intelligence_audit")
    .select("id, event_type, detail, field_name, old_value, new_value, created_at")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!opts?.skipSnapshot) {
    try {
      await supabase.from("vyron_supplier_score_snapshots").insert({
        company_id: companyId,
        supplier_id: supplierId,
        overall_score: scorecard.overallScore,
        price_stability: scorecard.priceStability,
        delivery_score: scorecard.deliveryScore,
        invoice_accuracy: scorecard.invoiceAccuracy,
        po_compliance: scorecard.poCompliance,
        risk_score: scorecard.riskScore,
        risk_level: scorecard.riskLevel,
      });
    } catch {
      /* table may not exist until migration 19 */
    }
  }

  if (!opts?.skipAudit) {
    try {
      await supabase.from("vyron_supplier_intelligence_audit").insert({
        company_id: companyId,
        supplier_id: supplierId,
        event_type: "Profile Viewed",
        actor: "system",
        detail: `Scorecard overall ${scorecard.overallScore} · risk ${scorecard.riskLevel}`,
        snapshot: { scorecard, spend: { lifetime } },
      });
    } catch {
      /* table may not exist until migration 19 */
    }
  }

  return {
    supplier: {
      id: supplierId,
      supplierName,
      category: String(supplierRow.category || "—"),
      contactEmail: supplierRow.contact_email as string | null,
      invoiceEmail: supplierRow.invoice_email as string | null,
      contactPhone: (supplierRow.contact_phone as string | null) || null,
      paymentTerms: (supplierRow.payment_terms as string | null) || "Net 30",
      vatNumber: (supplierRow.vat_number as string | null) || null,
      accountNumber: (supplierRow.account_number as string | null) || null,
      isActive: supplierRow.is_active !== false,
      riskStatus: supplierRow.risk_status as string | null,
    },
    spend: {
      thisMonth: procStats.spendThisMonth,
      thisYear: procStats.spendThisYear,
      lifetime,
    },
    scorecard,
    priceHistory: {
      monthly: buildPriceTrends(movementRows, "month"),
      quarterly: buildPriceTrends(movementRows, "quarter"),
      yearly: buildPriceTrends(movementRows, "year"),
      latest: latestPrice,
      movements: movementRows.map((m) => ({
        id: String(m.id),
        itemName: String(m.entity_name || m.item_description || "—"),
        previousPrice: safeNum(m.previous_price),
        currentPrice: safeNum(m.new_price),
        difference: safeNum(m.price_difference ?? safeNum(m.new_price) - safeNum(m.previous_price)),
        percentage: safeNum(m.percentage_change),
        invoiceDate: (m.invoice_date as string | null) || null,
        documentId: (m.document_id as string | null) || null,
      })),
    },
    inflation: {
      largestIncrease: largest
        ? {
            itemName: String(largest.entity_name || largest.item_description || "—"),
            percentage: safeNum(largest.percentage_change),
          }
        : null,
      mostFrequentIncrease: mostFrequent,
      highestAnnualInflation,
      increaseCount: increases.length,
    },
    benchmarks: benchmarks.slice(0, 12),
    variances: {
      po: { frequency: poWithVariance.length, value: round2(poVarianceValue), risk: varianceRisk(poVarianceValue, poWithVariance.length) },
      invoice: {
        frequency: invoiceVarianceCount,
        value: round2(poList.reduce((s, p) => s + Math.abs(safeNum(p.variance)), 0)),
        risk: varianceRisk(invoiceVarianceCount * 500, invoiceVarianceCount),
      },
      grn: {
        frequency: partial + late,
        value: round2(grnVarianceValue),
        risk: varianceRisk(grnVarianceValue, partial + late),
      },
    },
    performance: {
      orders: procStats.poCount,
      receipts: procStats.grnCount,
      invoices: procStats.invoiceCount,
      onTimeDeliveries: onTime,
      partialDeliveries: partial,
      backOrders: (backOrders || []).length,
      rejectedDeliveries,
      onTimePct,
    },
    risk: { level: scorecard.riskLevel, score: scorecard.riskScore, factors: riskFactors },
    savingsOpportunities,
    timeline: timeline.slice(0, 60),
    documents: {
      purchaseOrders: poList.map((po) => ({
        id: String(po.id),
        label: String(po.po_number),
        total: safeNum(po.total),
        status: String(po.status),
        href: `/purchase-orders/${po.id}`,
      })),
      invoices: (invoices || []).map((inv) => ({
        id: String(inv.id),
        label: String(inv.document_number || inv.id).slice(0, 20),
        total: safeNum(inv.total),
        status: String(inv.status),
        href: `/document-intelligence/${inv.id}`,
      })),
      grns: grnList.map((g) => ({
        id: String(g.id),
        label: String(g.grn_number),
        status: String(g.status),
        href: `/purchase-orders/${g.purchase_order_id}`,
      })),
      contracts: contracts.map((c) => ({
        id: String(c.id),
        label: String(c.document_number || "Contract"),
        status: String(c.status),
        href: `/document-intelligence/${c.id}`,
      })),
    },
    auditTrail: (auditRows || []).map((a) => ({
      id: String(a.id),
      eventType: String(a.event_type),
      detail: String(a.detail || ""),
      fieldName: (a.field_name as string | null) || null,
      oldValue: (a.old_value as string | null) || null,
      newValue: (a.new_value as string | null) || null,
      createdAt: String(a.created_at),
    })),
    aiRecommendations: aiRecs.map((r) => ({
      recommendationKey: r.recommendation_key,
      title: r.title,
      category: r.category,
      potentialBenefitAnnual: safeNum(r.potential_benefit_annual),
      confidenceScore: safeNum(r.confidence_score),
      href: `/ai-procurement-manager/${encodeURIComponent(r.recommendation_key)}`,
    })),
  };
}

function formatCompact(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}
