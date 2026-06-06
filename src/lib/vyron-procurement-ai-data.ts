import { supabase } from "@/lib/supabase";
import {
  computeProcurementHealthScore,
  recomputeProcurementRecommendations,
  type GeneratedProcurementRecommendation,
  type ProcurementHealthScore,
} from "@/lib/vyron-procurement-ai-engine";
import { formatMoney } from "@/lib/vyron-cost-product-data";

export type { ProcurementHealthScore } from "@/lib/vyron-procurement-ai-engine";

export type ProcurementRecommendation = {
  id: string;
  recommendation_key: string;
  category: string;
  title: string;
  summary: string;
  problem_statement: string;
  cause_statement: string;
  recommended_action: string;
  why_exists: string;
  data_used: Record<string, unknown>;
  formula_expression: string;
  confidence_score: number;
  confidence_level: string;
  is_estimated: boolean;
  missing_inputs: string[];
  affected_products: Array<{ productId: string; productName: string }>;
  affected_suppliers: Array<{ supplierId: string | null; supplierName: string }>;
  expected_result: string;
  potential_benefit_monthly: number;
  potential_benefit_annual: number;
  expected_gp_improvement_pct?: number | null;
  selling_price_adjustment?: number | null;
  status: string;
  owner_name: string;
  owner_email: string;
  due_date: string;
  scheduled_review_date: string;
  expected_benefit: number;
  actual_benefit: number;
  implementation_date: string;
  evidence: string;
  notes: string;
};

export type ProcurementTrackingInput = {
  status:
    | "New"
    | "Assigned"
    | "Under Review"
    | "Accepted"
    | "Rejected"
    | "Implemented"
    | "Closed"
    | "Scheduled Review";
  ownerName?: string;
  ownerEmail?: string;
  notes?: string;
  dueDate?: string;
  scheduledReviewDate?: string;
  expectedBenefit?: number;
  actualBenefit?: number;
  implementationDate?: string;
  evidence?: string;
};

export type ProcurementTrackingSnapshot = {
  status: string;
  ownerName: string;
  ownerEmail: string;
  notes: string;
  dueDate: string;
  scheduledReviewDate: string;
  expectedBenefit: number;
  actualBenefit: number;
  implementationDate: string;
  evidence: string;
};

export type ProcurementEvidenceRow = {
  id: string;
  evidence_type: string;
  title: string;
  content: string | null;
  document_url: string | null;
  created_by: string | null;
  created_at: string;
};

export type ProcurementAuditRow = {
  id: string;
  changed_by: string | null;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
};

export type ProcurementExecutiveStats = {
  healthScore: ProcurementHealthScore;
  openRecommendations: number;
  acceptedRecommendations: number;
  implementedRecommendations: number;
  highRiskItems: number;
  potentialSavingsAnnual: number;
  realizedSavingsAnnual: number;
  byCategory: Array<{ category: string; count: number; potentialAnnual: number }>;
  topRecommendations: Array<{
    recommendation_key: string;
    category: string;
    title: string;
    potential_benefit_annual: number;
    confidence_score: number;
    status: string;
  }>;
};

const DEMO_TENANT_ID = "48002864-8800-4000-9000-000000000001";

export function procurementMoney(value: number | null | undefined) {
  return formatMoney(value || 0);
}

function mapDbRow(
  row: Record<string, unknown>,
  tracking?: ProcurementTrackingSnapshot | null
): ProcurementRecommendation {
  return {
    id: String(row.recommendation_key),
    recommendation_key: String(row.recommendation_key),
    category: String(row.category),
    title: String(row.title),
    summary: String(row.summary || ""),
    problem_statement: String(row.problem_statement || row.summary || ""),
    cause_statement: String(row.cause_statement || row.why_exists || ""),
    recommended_action: String(row.recommended_action),
    why_exists: String(row.why_exists),
    data_used: (row.data_used as Record<string, unknown>) || {},
    formula_expression: String(row.formula_expression),
    confidence_score: Number(row.confidence_score || 0),
    confidence_level: String(row.confidence_level || "Medium Confidence"),
    is_estimated: Boolean(row.is_estimated),
    missing_inputs: Array.isArray(row.missing_inputs)
      ? (row.missing_inputs as string[])
      : [],
    affected_products: (row.affected_products as ProcurementRecommendation["affected_products"]) || [],
    affected_suppliers: (row.affected_suppliers as ProcurementRecommendation["affected_suppliers"]) || [],
    expected_result: String(row.expected_result || ""),
    potential_benefit_monthly: Number(row.potential_benefit_monthly || 0),
    potential_benefit_annual: Number(row.potential_benefit_annual || 0),
    expected_gp_improvement_pct: row.expected_gp_improvement_pct != null ? Number(row.expected_gp_improvement_pct) : null,
    selling_price_adjustment: row.selling_price_adjustment != null ? Number(row.selling_price_adjustment) : null,
    status: tracking?.status || "New",
    owner_name: tracking?.ownerName || "",
    owner_email: tracking?.ownerEmail || "",
    due_date: tracking?.dueDate || "",
    scheduled_review_date: tracking?.scheduledReviewDate || "",
    expected_benefit: tracking?.expectedBenefit ?? Number(row.potential_benefit_annual || 0),
    actual_benefit: tracking?.actualBenefit ?? 0,
    implementation_date: tracking?.implementationDate || "",
    evidence: tracking?.evidence || "",
    notes: tracking?.notes || "",
  };
}

async function getTrackingMap(keys: string[]) {
  const map = new Map<string, ProcurementTrackingSnapshot>();
  if (!supabase || !keys.length) return map;
  const { data, error } = await supabase
    .from("vyron_procurement_recommendation_tracking")
    .select("*")
    .in("recommendation_key", keys);
  if (isMissingProcurementTable(error)) return map;
  for (const row of data || []) {
    map.set(String(row.recommendation_key), {
      status: String(row.status || "New"),
      ownerName: String(row.owner_name || ""),
      ownerEmail: String(row.owner_email || ""),
      notes: String(row.notes || ""),
      dueDate: String(row.due_date || ""),
      scheduledReviewDate: String(row.scheduled_review_date || ""),
      expectedBenefit: Number(row.expected_benefit || 0),
      actualBenefit: Number(row.actual_benefit || 0),
      implementationDate: String(row.implementation_date || ""),
      evidence: String(row.evidence || ""),
    });
  }
  return map;
}

function isMissingProcurementTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return String(error.message || "").includes("vyron_procurement_recommendations");
}

export async function getProcurementRecommendations(): Promise<ProcurementRecommendation[]> {
  if (!supabase) return fallbackInMemoryRecommendations();

  try {
    let { data, error } = await supabase
      .from("vyron_procurement_recommendations")
      .select("*")
      .eq("tenant_id", DEMO_TENANT_ID)
      .order("potential_benefit_annual", { ascending: false });

    if (isMissingProcurementTable(error)) return fallbackInMemoryRecommendations();
    if (error) throw error;

    if (!data?.length) {
      try {
        await recomputeProcurementRecommendations();
        const retry = await supabase
          .from("vyron_procurement_recommendations")
          .select("*")
          .eq("tenant_id", DEMO_TENANT_ID)
          .order("potential_benefit_annual", { ascending: false });
        if (isMissingProcurementTable(retry.error)) return fallbackInMemoryRecommendations();
        data = retry.data;
      } catch {
        return fallbackInMemoryRecommendations();
      }
    }

    const keys = (data || []).map((r) => String(r.recommendation_key));
    const trackingMap = await getTrackingMap(keys);
    return (data || []).map((row) =>
      mapDbRow(row as Record<string, unknown>, trackingMap.get(String(row.recommendation_key)))
    );
  } catch {
    return fallbackInMemoryRecommendations();
  }
}

async function fallbackInMemoryRecommendations(): Promise<ProcurementRecommendation[]> {
  const { generateProcurementRecommendations } = await import("@/lib/vyron-procurement-ai-engine");
  const generated = await recomputeProcurementRecommendations().catch(() => generateProcurementRecommendations());
  return (generated as GeneratedProcurementRecommendation[]).map((row) =>
    mapDbRow(
      {
        recommendation_key: row.recommendation_key,
        category: row.category,
        title: row.title,
        summary: row.summary,
        problem_statement: row.problem_statement,
        cause_statement: row.cause_statement,
        recommended_action: row.recommended_action,
        why_exists: row.why_exists,
        data_used: row.data_used,
        formula_expression: row.formula_expression,
        confidence_score: row.confidence_score,
        confidence_level: row.confidence_level,
        is_estimated: row.is_estimated,
        missing_inputs: row.missing_inputs,
        affected_products: row.affected_products,
        affected_suppliers: row.affected_suppliers,
        expected_result: row.expected_result,
        potential_benefit_monthly: row.potential_benefit_monthly,
        potential_benefit_annual: row.potential_benefit_annual,
        expected_gp_improvement_pct: row.expected_gp_improvement_pct,
        selling_price_adjustment: row.selling_price_adjustment,
      },
      null
    )
  );
}

export async function getProcurementRecommendationByKey(
  recommendationKey: string
): Promise<ProcurementRecommendation | null> {
  const all = await getProcurementRecommendations();
  return all.find((r) => r.recommendation_key === recommendationKey) || null;
}

export async function getProcurementHealthScore(): Promise<ProcurementHealthScore> {
  return computeProcurementHealthScore();
}

export async function getProcurementExecutiveStats(): Promise<ProcurementExecutiveStats> {
  const [healthScore, recommendations] = await Promise.all([
    getProcurementHealthScore(),
    getProcurementRecommendations(),
  ]);

  const closedStatuses = ["Implemented", "Rejected", "Closed"];
  const open = recommendations.filter((r) => !closedStatuses.includes(r.status));
  const accepted = recommendations.filter((r) => r.status === "Accepted");
  const implemented = recommendations.filter((r) => r.status === "Implemented");
  const highRiskItems = recommendations.filter(
    (r) =>
      !closedStatuses.includes(r.status) &&
      (Number(r.confidence_score || 0) < 65 || r.is_estimated || Number(r.potential_benefit_annual || 0) >= 15000)
  ).length;
  const potentialSavingsAnnual = open.reduce((s, r) => s + Number(r.potential_benefit_annual || 0), 0);
  const realizedSavingsAnnual = implemented.reduce((s, r) => s + Number(r.actual_benefit || r.expected_benefit || 0), 0);
  const topRecommendations = open
    .slice()
    .sort((a, b) => Number(b.potential_benefit_annual || 0) - Number(a.potential_benefit_annual || 0))
    .slice(0, 5)
    .map((r) => ({
      recommendation_key: r.recommendation_key,
      category: r.category,
      title: r.title,
      potential_benefit_annual: r.potential_benefit_annual,
      confidence_score: r.confidence_score,
      status: r.status,
    }));

  const byCategoryMap = new Map<string, { count: number; potentialAnnual: number }>();
  for (const r of recommendations) {
    const cur = byCategoryMap.get(r.category) || { count: 0, potentialAnnual: 0 };
    cur.count += 1;
    cur.potentialAnnual += Number(r.potential_benefit_annual || 0);
    byCategoryMap.set(r.category, cur);
  }

  return {
    healthScore,
    openRecommendations: open.length,
    acceptedRecommendations: accepted.length,
    implementedRecommendations: implemented.length,
    highRiskItems,
    potentialSavingsAnnual,
    realizedSavingsAnnual,
    byCategory: Array.from(byCategoryMap.entries()).map(([category, v]) => ({
      category,
      count: v.count,
      potentialAnnual: v.potentialAnnual,
    })),
    topRecommendations,
  };
}

export async function getProcurementRecommendationsForSupplier(
  supplierId: string,
  supplierName?: string
): Promise<ProcurementRecommendation[]> {
  const all = await getProcurementRecommendations();
  const nameLower = (supplierName || "").toLowerCase();
  return all.filter((r) => {
    const matchId = r.affected_suppliers.some((s) => s.supplierId === supplierId);
    const matchName =
      Boolean(nameLower) &&
      (r.affected_suppliers.some((s) => s.supplierName.toLowerCase().includes(nameLower)) ||
        r.title.toLowerCase().includes(nameLower) ||
        r.data_used?.supplierId === supplierId);
    return matchId || Boolean(matchName);
  });
}

export async function getProcurementTrackingByKey(
  recommendationKey: string
): Promise<ProcurementTrackingSnapshot | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("vyron_procurement_recommendation_tracking")
    .select("*")
    .eq("recommendation_key", recommendationKey)
    .maybeSingle();
  if (!data) return null;
  return {
    status: String(data.status || "New"),
    ownerName: String(data.owner_name || ""),
    ownerEmail: String(data.owner_email || ""),
    notes: String(data.notes || ""),
    dueDate: String(data.due_date || ""),
    scheduledReviewDate: String(data.scheduled_review_date || ""),
    expectedBenefit: Number(data.expected_benefit || 0),
    actualBenefit: Number(data.actual_benefit || 0),
    implementationDate: String(data.implementation_date || ""),
    evidence: String(data.evidence || ""),
  };
}

export async function saveProcurementTracking(
  recommendationKey: string,
  input: ProcurementTrackingInput,
  changedBy = "Procurement Manager"
) {
  if (!supabase) return;
  const previous = await getProcurementTrackingByKey(recommendationKey);

  const { data: rec } = await supabase
    .from("vyron_procurement_recommendations")
    .select("tenant_id, potential_benefit_annual")
    .eq("recommendation_key", recommendationKey)
    .maybeSingle();

  const tenantId = rec?.tenant_id || DEMO_TENANT_ID;
  const defaultExpected = Number(rec?.potential_benefit_annual || 0);

  const payload = {
    tenant_id: tenantId,
    recommendation_key: recommendationKey,
    status: input.status,
    owner_name: input.ownerName ?? previous?.ownerName ?? null,
    owner_email: input.ownerEmail ?? previous?.ownerEmail ?? null,
    notes: input.notes ?? previous?.notes ?? null,
    due_date: input.dueDate || previous?.dueDate || null,
    scheduled_review_date: input.scheduledReviewDate || previous?.scheduledReviewDate || null,
    expected_benefit: input.expectedBenefit ?? previous?.expectedBenefit ?? defaultExpected,
    actual_benefit: input.actualBenefit ?? previous?.actualBenefit ?? 0,
    implementation_date: input.implementationDate || previous?.implementationDate || null,
    evidence: input.evidence ?? previous?.evidence ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("vyron_procurement_recommendation_tracking")
    .upsert(payload, { onConflict: "tenant_id,recommendation_key" });
  if (error) throw error;

  const auditChanges: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  if ((previous?.status || "New") !== input.status) {
    auditChanges.push({ field: "status", oldValue: previous?.status || null, newValue: input.status });
  }
  if (String(previous?.actualBenefit || 0) !== String(payload.actual_benefit || 0)) {
    auditChanges.push({
      field: "actual_benefit",
      oldValue: String(previous?.actualBenefit || 0),
      newValue: String(payload.actual_benefit || 0),
    });
  }

  if (auditChanges.length) {
    await supabase.from("vyron_procurement_recommendation_audit").insert(
      auditChanges.map((change) => ({
        tenant_id: tenantId,
        recommendation_key: recommendationKey,
        changed_by: changedBy,
        field_name: change.field,
        old_value: change.oldValue,
        new_value: change.newValue,
      }))
    );
  }
}

export async function addProcurementEvidence(
  recommendationKey: string,
  evidence: { evidenceType: string; title: string; content?: string; documentUrl?: string; createdBy?: string }
) {
  if (!supabase) return;
  const { data: rec } = await supabase
    .from("vyron_procurement_recommendations")
    .select("tenant_id")
    .eq("recommendation_key", recommendationKey)
    .maybeSingle();
  const tenantId = rec?.tenant_id || DEMO_TENANT_ID;
  const { error } = await supabase.from("vyron_procurement_recommendation_evidence").insert({
    tenant_id: tenantId,
    recommendation_key: recommendationKey,
    evidence_type: evidence.evidenceType,
    title: evidence.title,
    content: evidence.content || null,
    document_url: evidence.documentUrl || null,
    created_by: evidence.createdBy || "Procurement Manager",
  });
  if (error) throw error;
}

export async function getProcurementEvidence(recommendationKey: string): Promise<ProcurementEvidenceRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("vyron_procurement_recommendation_evidence")
    .select("*")
    .eq("recommendation_key", recommendationKey)
    .order("created_at", { ascending: false });
  return (data || []).map((row) => ({
    id: String(row.id),
    evidence_type: String(row.evidence_type),
    title: String(row.title),
    content: row.content ? String(row.content) : null,
    document_url: row.document_url ? String(row.document_url) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
  }));
}

export async function getProcurementAuditTrail(recommendationKey: string): Promise<ProcurementAuditRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("vyron_procurement_recommendation_audit")
    .select("*")
    .eq("recommendation_key", recommendationKey)
    .order("changed_at", { ascending: false })
    .limit(50);
  return (data || []).map((row) => ({
    id: String(row.id),
    changed_by: row.changed_by ? String(row.changed_by) : null,
    changed_at: String(row.changed_at),
    field_name: String(row.field_name),
    old_value: row.old_value != null ? String(row.old_value) : null,
    new_value: row.new_value != null ? String(row.new_value) : null,
  }));
}
