import { supabase } from "@/lib/supabase";
import { getProducts, calcSuggestedPrice, formatMoney } from "@/lib/vyron-cost-product-data";
import { getSuppliers, getIngredients } from "@/lib/vyron-cost-core-data";
import { getPhase4RecoveryInsights } from "@/lib/vyron-supplier-intelligence-engine";
import {
  buildRecoveryExecutiveSummary,
  getRecoveryCalculationByKey,
  getRecoveryCalculationsV2,
  recomputeRecoveryIntelligenceV2,
  type RecoveryExecutiveSummary,
} from "@/lib/vyron-recovery-intelligence-v2";
export type { RecoveryExecutiveSummary } from "@/lib/vyron-recovery-intelligence-v2";

export type RecoveryOpportunity = {
  id: string;
  opportunity_key?: string;
  opportunity_type: string;
  title: string;
  description?: string | null;
  formula?: string | null;
  monthly_value?: number | null;
  annual_value?: number | null;
  confidence?: number | null;
  status?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  ingredient_id?: string | null;
  ingredient_name?: string | null;
  recommended_action?: string | null;
  data_source?: string | null;
  confidence_level?: "High Confidence" | "Medium Confidence" | "Low Confidence";
  is_estimated?: boolean;
  formula_inputs?: Record<string, unknown>;
  missing_inputs?: string[];
  products_affected?: Array<{ productId: string; productName: string }>;
  estimated_recovery?: number | null;
  verified_recovery?: number | null;
  potential_recovery?: number | null;
  recovered_to_date?: number | null;
  tracking_status?: string | null;
  owner_name?: string | null;
  due_date?: string | null;
  actual_recovery?: number | null;
  recovery_date?: string | null;
  recovery_method?: string | null;
  recovery_evidence?: string | null;
  action_taken?: boolean;
};

export type RecoveryTrackingInput = {
  status: "New" | "Under Review" | "Accepted" | "Actioned" | "Recovered" | "Rejected" | "Ignored";
  ownerName?: string;
  ownerEmail?: string;
  notes?: string;
  dueDate?: string;
  actionTaken?: boolean;
  actualRecovery?: number;
  recoveryDate?: string;
  recoveryMethod?: string;
  recoveryEvidence?: string;
};

export type RecoveryTrackingSnapshot = {
  status: string;
  ownerName: string;
  ownerEmail: string;
  notes: string;
  dueDate: string;
  actionTaken: boolean;
  potentialRecovery: number;
  actualRecovery: number;
  recoveryDate: string;
  recoveryMethod: string;
  recoveryEvidence: string;
};

export type RecoveryEvidenceRow = {
  id: string;
  evidence_type: string;
  title: string;
  content: string | null;
  document_url: string | null;
  created_by: string | null;
  created_at: string;
};

export type RecoveryAuditRow = {
  id: string;
  changed_by: string | null;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
};

export type RecoveryAuditSummaryRow = {
  opportunity_key: string;
  changed_by: string | null;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
};

export function money(value: number | null | undefined) {
  return formatMoney(value || 0);
}

function uuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function getRecoveryOpportunities(): Promise<RecoveryOpportunity[]> {
  let v2Rows = await getRecoveryCalculationsV2();
  if (!v2Rows.length) {
    try {
      v2Rows = await recomputeRecoveryIntelligenceV2();
    } catch {
      v2Rows = [];
    }
  }
  if (v2Rows.length) {
    const trackingByKey = await getRecoveryTrackingMap(v2Rows.map((row) => row.opportunity_key));
    return v2Rows.map((row) => ({
      id: row.opportunity_key,
      opportunity_key: row.opportunity_key,
      opportunity_type: row.category,
      title: row.title,
      description: row.is_estimated
        ? `${row.title}. Estimated Recovery shown because one or more inputs require assumptions.`
        : row.title,
      formula: row.formula_expression,
      formula_inputs: row.formula_inputs,
      missing_inputs: row.missing_inputs,
      monthly_value: row.monthly_recovery,
      annual_value: row.annual_recovery,
      confidence: row.confidence_score,
      confidence_level: row.confidence_level,
      is_estimated: row.is_estimated,
      status: trackingByKey.get(row.opportunity_key)?.status || row.status,
      recommended_action: row.recommended_action,
      data_source: "Recovery Intelligence V2",
      products_affected: row.products_affected,
      estimated_recovery: row.estimated_recovery,
      verified_recovery: row.verified_recovery,
      potential_recovery: row.potential_recovery,
      recovered_to_date: row.recovered_to_date,
      tracking_status: trackingByKey.get(row.opportunity_key)?.status || "New",
      owner_name: trackingByKey.get(row.opportunity_key)?.ownerName || null,
      due_date: trackingByKey.get(row.opportunity_key)?.dueDate || null,
      actual_recovery: trackingByKey.get(row.opportunity_key)?.actualRecovery ?? 0,
      recovery_date: trackingByKey.get(row.opportunity_key)?.recoveryDate || null,
      recovery_method: trackingByKey.get(row.opportunity_key)?.recoveryMethod || null,
      recovery_evidence: trackingByKey.get(row.opportunity_key)?.recoveryEvidence || null,
      action_taken: trackingByKey.get(row.opportunity_key)?.actionTaken || false,
    }));
  }

  if (!supabase) return demoRecoveryOpportunities;

  const { data, error } = await supabase
    .from("vyron_cost_recovery_opportunities")
    .select("*")
    .eq("company_id", "48002864-8800-4000-9000-000000000001")
    .order("annual_saving", { ascending: false })
    .limit(500);

  if (!error && data && data.length > 0) {
    return (data as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      opportunity_key: String(row.id),
      opportunity_type: String(row.category || "Recovery"),
      title: String(row.opportunity || row.title || "Recovery opportunity"),
      description: String(row.opportunity || ""),
      monthly_value: Number(row.monthly_saving || 0),
      annual_value: Number(row.annual_saving || row.annual_value || 0),
      status: String(row.status || "Open"),
      recommended_action: String(row.action || row.recommended_action || ""),
      data_source: "vyron_cost_recovery_opportunities",
    }));
  }

  return generateCalculatedRecoveryOpportunities();
}

export async function getRecoveryOpportunityById(id: string): Promise<RecoveryOpportunity | null> {
  const v2 = await getRecoveryCalculationByKey(id);
  if (v2) {
    const tracking = await getRecoveryTrackingByKey(v2.opportunity_key);
    return {
      id: v2.opportunity_key,
      opportunity_key: v2.opportunity_key,
      opportunity_type: v2.category,
      title: v2.title,
      description: v2.is_estimated
        ? `${v2.title}. Estimated Recovery used where inputs were not fully available.`
        : v2.title,
      formula: v2.formula_expression,
      formula_inputs: v2.formula_inputs,
      missing_inputs: v2.missing_inputs,
      monthly_value: v2.monthly_recovery,
      annual_value: v2.annual_recovery,
      confidence: v2.confidence_score,
      confidence_level: v2.confidence_level,
      is_estimated: v2.is_estimated,
      status: tracking?.status || v2.status,
      recommended_action: v2.recommended_action,
      data_source: "Recovery Intelligence V2",
      products_affected: v2.products_affected,
      estimated_recovery: v2.estimated_recovery,
      verified_recovery: v2.verified_recovery,
      potential_recovery: v2.potential_recovery,
      recovered_to_date: v2.recovered_to_date,
      tracking_status: tracking?.status || "New",
      owner_name: tracking?.ownerName || null,
      due_date: tracking?.dueDate || null,
      actual_recovery: tracking?.actualRecovery || 0,
      recovery_date: tracking?.recoveryDate || null,
      recovery_method: tracking?.recoveryMethod || null,
      recovery_evidence: tracking?.recoveryEvidence || null,
      action_taken: tracking?.actionTaken || false,
    };
  }

  if (!supabase || !uuidLike(id)) {
    return demoRecoveryOpportunities.find((item) => item.id === id) || null;
  }

  const { data, error } = await supabase
    .from("vyron_cost_recovery_opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!error && data) return data as RecoveryOpportunity;

  const generated = await generateCalculatedRecoveryOpportunities();
  return generated.find((item) => item.id === id) || null;
}

export async function generateCalculatedRecoveryOpportunities(): Promise<RecoveryOpportunity[]> {
  const [products, suppliers, ingredients] = await Promise.all([
    getProducts(),
    getSuppliers(),
    getIngredients(),
  ]);

  const opportunities: RecoveryOpportunity[] = [];

  for (const product of products) {
    const sellingPrice = Number(product.selling_price || 0);
    const cost = Number(product.total_cost || 0);
    const targetGp = Number(product.target_gp || 40);
    const currentGp = Number(product.calculated_gp || 0);

    if (sellingPrice > 0 && cost > 0 && currentGp < targetGp) {
      const suggestedPrice = calcSuggestedPrice(cost, targetGp);
      const priceGap = Math.max(0, suggestedPrice - sellingPrice);
      const assumedMonthlyUnits = 1000;
      const monthlyValue = priceGap * assumedMonthlyUnits;

      opportunities.push({
        id: `calc-product-${product.id}`,
        opportunity_type: "Margin Recovery",
        title: `${product.product_name} below target GP`,
        description: `${product.product_name} is below target GP. Suggested selling price is ${money(suggestedPrice)}.`,
        formula: "Monthly Recovery = (Suggested Selling Price - Current Selling Price) × Estimated Monthly Units",
        monthly_value: monthlyValue,
        annual_value: monthlyValue * 12,
        confidence: 78,
        status: "Identified",
        product_id: product.id,
        product_name: product.product_name,
        recommended_action: "Review selling price, BOM cost and target GP.",
        data_source: "Product GP calculation",
      });
    }
  }

  for (const supplier of suppliers) {
    const movement = Number(supplier.last_price_movement || 0);
    if (movement > 5) {
      const assumedMonthlySpend = 25000;
      const monthlyValue = assumedMonthlySpend * (movement / 100);

      opportunities.push({
        id: `calc-supplier-${supplier.id}`,
        opportunity_type: "Supplier Recovery",
        title: `${supplier.supplier_name} price movement detected`,
        description: `${supplier.supplier_name} has a ${movement.toFixed(1)}% price movement. This may be reducing product margin.`,
        formula: "Monthly Recovery = Estimated Monthly Supplier Spend × Price Movement %",
        monthly_value: monthlyValue,
        annual_value: monthlyValue * 12,
        confidence: 72,
        status: "Identified",
        supplier_id: supplier.id,
        supplier_name: supplier.supplier_name,
        recommended_action: "Negotiate pricing or compare alternate suppliers.",
        data_source: "Supplier movement calculation",
      });
    }
  }

  for (const ingredient of ingredients) {
    const previous = Number(ingredient.previous_cost || 0);
    const current = Number(ingredient.purchase_cost || 0);
    if (previous > 0 && current > previous) {
      const increase = current - previous;
      const assumedMonthlyUsage = 500;
      const monthlyValue = increase * assumedMonthlyUsage;

      opportunities.push({
        id: `calc-ingredient-${ingredient.id}`,
        opportunity_type: "Ingredient Recovery",
        title: `${ingredient.ingredient_name} cost increase`,
        description: `${ingredient.ingredient_name} increased from ${money(previous)} to ${money(current)}.`,
        formula: "Monthly Recovery = (Current Cost - Previous Cost) × Estimated Monthly Usage",
        monthly_value: monthlyValue,
        annual_value: monthlyValue * 12,
        confidence: 70,
        status: "Identified",
        ingredient_id: ingredient.id,
        ingredient_name: ingredient.ingredient_name,
        recommended_action: "Review supplier pricing and BOM impact.",
        data_source: "Ingredient price movement",
      });
    }
  }

  const phase4Insights = await getPhase4RecoveryInsights();
  for (const insight of phase4Insights) {
    opportunities.push({
      id: insight.id,
      opportunity_type: insight.opportunityType,
      title: insight.title,
      description: insight.description,
      formula:
        insight.opportunityType === "Supplier benchmark"
          ? "Monthly Recovery = Supplier benchmark variance × monthly quantity"
          : "Monthly Recovery = Price increase impact not yet recovered in selling price",
      monthly_value: insight.monthlyRecovery,
      annual_value: insight.annualRecovery,
      confidence: insight.confidence,
      status: "Identified",
      supplier_name: insight.supplierName || null,
      ingredient_name: insight.ingredientName || null,
      recommended_action: insight.recommendedAction,
      data_source: "Phase 4 Supplier Intelligence Engine",
    });
  }

  return opportunities.sort((a, b) => Number(b.annual_value || 0) - Number(a.annual_value || 0));
}

export async function saveCalculatedOpportunities(): Promise<number> {
  try {
    const v2Rows = await recomputeRecoveryIntelligenceV2();
    if (v2Rows.length) return v2Rows.length;
  } catch {
    // fallback to legacy save path if V2 table is not available yet
  }

  if (!supabase) return 0;

  const generated = await generateCalculatedRecoveryOpportunities();

  const rows = generated
    .filter((item) => !String(item.id).startsWith("demo"))
    .map((item) => ({
      opportunity_type: item.opportunity_type,
      title: item.title,
      description: item.description,
      formula: item.formula,
      monthly_value: item.monthly_value,
      annual_value: item.annual_value,
      confidence: item.confidence,
      status: item.status,
      product_id: item.product_id && uuidLike(item.product_id) ? item.product_id : null,
      product_name: item.product_name || null,
      supplier_id: item.supplier_id && uuidLike(item.supplier_id) ? item.supplier_id : null,
      supplier_name: item.supplier_name || null,
      ingredient_id: item.ingredient_id && uuidLike(item.ingredient_id) ? item.ingredient_id : null,
      ingredient_name: item.ingredient_name || null,
      recommended_action: item.recommended_action,
      data_source: item.data_source,
      updated_at: new Date().toISOString(),
    }));

  if (!rows.length) return 0;

  const { error } = await supabase
    .from("vyron_cost_recovery_opportunities")
    .insert(rows);

  if (error) throw error;

  return rows.length;
}

export async function updateRecoveryStatus(id: string, status: string) {
  if (!supabase) return;

  if (!uuidLike(id)) {
    await saveRecoveryTracking(id, {
      status: status as RecoveryTrackingInput["status"],
    });
    return;
  }

  const { error } = await supabase
    .from("vyron_cost_recovery_opportunities")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function getRecoveryTrackingByKey(opportunityKey: string): Promise<RecoveryTrackingSnapshot | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("vyron_recovery_tracking")
    .select("*")
    .eq("opportunity_key", opportunityKey)
    .maybeSingle();
  if (!data) return null;
  return {
    status: String(data.status || "New"),
    ownerName: String(data.owner_name || ""),
    ownerEmail: String(data.owner_email || ""),
    notes: String(data.notes || ""),
    dueDate: String(data.due_date || ""),
    actionTaken: Boolean(data.action_taken),
    potentialRecovery: Number(data.potential_recovery || 0),
    actualRecovery: Number(data.actual_recovery || 0),
    recoveryDate: String(data.recovery_date || ""),
    recoveryMethod: String(data.recovery_method || ""),
    recoveryEvidence: String(data.recovery_evidence || ""),
  };
}

async function getRecoveryTrackingMap(opportunityKeys: string[]) {
  const map = new Map<string, RecoveryTrackingSnapshot>();
  if (!supabase || !opportunityKeys.length) return map;
  const { data } = await supabase
    .from("vyron_recovery_tracking")
    .select("*")
    .in("opportunity_key", opportunityKeys);
  for (const row of data || []) {
    map.set(String(row.opportunity_key), {
      status: String(row.status || "New"),
      ownerName: String(row.owner_name || ""),
      ownerEmail: String(row.owner_email || ""),
      notes: String(row.notes || ""),
      dueDate: String(row.due_date || ""),
      actionTaken: Boolean(row.action_taken),
      potentialRecovery: Number(row.potential_recovery || 0),
      actualRecovery: Number(row.actual_recovery || 0),
      recoveryDate: String(row.recovery_date || ""),
      recoveryMethod: String(row.recovery_method || ""),
      recoveryEvidence: String(row.recovery_evidence || ""),
    });
  }
  return map;
}

export async function saveRecoveryTracking(opportunityKey: string, input: RecoveryTrackingInput, changedBy = "Finance Manager") {
  if (!supabase) return;
  const previous = await getRecoveryTrackingByKey(opportunityKey);
  const status = input.status;
  const payload = {
    opportunity_key: opportunityKey,
    status,
    owner_name: input.ownerName || previous?.ownerName || null,
    owner_email: input.ownerEmail || previous?.ownerEmail || null,
    notes: input.notes ?? previous?.notes ?? null,
    due_date: input.dueDate || previous?.dueDate || null,
    action_taken: input.actionTaken ?? previous?.actionTaken ?? false,
    action_taken_at: input.actionTaken ? new Date().toISOString() : null,
    actual_recovery: input.actualRecovery ?? previous?.actualRecovery ?? 0,
    recovery_date: input.recoveryDate || previous?.recoveryDate || null,
    recovery_method: input.recoveryMethod || previous?.recoveryMethod || null,
    recovery_evidence: input.recoveryEvidence || previous?.recoveryEvidence || null,
    updated_at: new Date().toISOString(),
  };

  const { data: calc } = await supabase
    .from("vyron_recovery_calculations")
    .select("tenant_id, potential_recovery")
    .eq("opportunity_key", opportunityKey)
    .maybeSingle();

  const tenantId = calc?.tenant_id || "48002864-8800-4000-9000-000000000001";

  const { error } = await supabase.from("vyron_recovery_tracking").upsert(
    {
      tenant_id: tenantId,
      potential_recovery: Number(calc?.potential_recovery || 0),
      ...payload,
    },
    { onConflict: "tenant_id,opportunity_key" }
  );
  if (error) throw error;

  const auditChanges: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  const prevStatus = previous?.status || null;
  if (prevStatus !== status) auditChanges.push({ field: "status", oldValue: prevStatus, newValue: status });
  if ((previous?.ownerName || null) !== (payload.owner_name || null)) {
    auditChanges.push({ field: "owner_name", oldValue: previous?.ownerName || null, newValue: payload.owner_name || null });
  }
  if (String(previous?.actualRecovery || 0) !== String(payload.actual_recovery || 0)) {
    auditChanges.push({
      field: "actual_recovery",
      oldValue: String(previous?.actualRecovery || 0),
      newValue: String(payload.actual_recovery || 0),
    });
  }

  if (auditChanges.length) {
    await supabase.from("vyron_recovery_audit_trail").insert(
      auditChanges.map((change) => ({
        tenant_id: tenantId,
        opportunity_key: opportunityKey,
        changed_by: changedBy,
        field_name: change.field,
        old_value: change.oldValue,
        new_value: change.newValue,
      }))
    );
  }
}

export async function addRecoveryEvidence(
  opportunityKey: string,
  evidence: { evidenceType: string; title: string; content?: string; documentUrl?: string; createdBy?: string }
) {
  if (!supabase) return;
  const { data: calc } = await supabase
    .from("vyron_recovery_calculations")
    .select("tenant_id")
    .eq("opportunity_key", opportunityKey)
    .maybeSingle();
  const tenantId = calc?.tenant_id || "48002864-8800-4000-9000-000000000001";
  const { error } = await supabase.from("vyron_recovery_evidence").insert({
    tenant_id: tenantId,
    opportunity_key: opportunityKey,
    evidence_type: evidence.evidenceType,
    title: evidence.title,
    content: evidence.content || null,
    document_url: evidence.documentUrl || null,
    created_by: evidence.createdBy || "Finance Manager",
  });
  if (error) throw error;
}

export async function getRecoveryEvidence(opportunityKey: string): Promise<RecoveryEvidenceRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("vyron_recovery_evidence")
    .select("*")
    .eq("opportunity_key", opportunityKey)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data || []) as RecoveryEvidenceRow[];
}

export async function getRecoveryAuditTrail(opportunityKey: string): Promise<RecoveryAuditRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("vyron_recovery_audit_trail")
    .select("*")
    .eq("opportunity_key", opportunityKey)
    .order("changed_at", { ascending: false })
    .limit(200);
  return (data || []) as RecoveryAuditRow[];
}

export async function getRecoveryTrackingExecutiveStats() {
  const opportunities = await getRecoveryOpportunities();
  const statuses = ["New", "Under Review", "Accepted", "Actioned", "Recovered", "Rejected"] as const;
  const statusCounts = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<string, number>;
  let recoveredThisMonth = 0;
  let recoveredThisYear = 0;
  let actualRecovered = 0;
  const ownerMap = new Map<string, number>();
  const categoryMap = new Map<string, number>();
  const now = new Date();

  for (const item of opportunities) {
    const status = item.tracking_status || "New";
    if (statusCounts[status] !== undefined) statusCounts[status] += 1;
    if (status === "Recovered") {
      const recoveredValue = Number(item.actual_recovery || item.recovered_to_date || 0);
      actualRecovered += recoveredValue;
      if (item.recovery_date) {
        const date = new Date(item.recovery_date);
        if (date.getUTCFullYear() === now.getUTCFullYear()) {
          recoveredThisYear += recoveredValue;
          if (date.getUTCMonth() === now.getUTCMonth()) recoveredThisMonth += recoveredValue;
        }
      }
    }
    const owner = item.owner_name || "Unassigned";
    ownerMap.set(owner, (ownerMap.get(owner) || 0) + Number(item.actual_recovery || 0));
    categoryMap.set(item.opportunity_type, (categoryMap.get(item.opportunity_type) || 0) + Number(item.actual_recovery || 0));
  }

  const potential = opportunities.reduce((sum, item) => sum + Number(item.potential_recovery || item.monthly_value || 0), 0);
  const successPct = potential > 0 ? (actualRecovered / potential) * 100 : 0;

  return {
    potentialRecovery: potential,
    recoveredRecovery: actualRecovered,
    recoverySuccessPct: successPct,
    openOpportunities: opportunities.filter((item) => !["Recovered", "Rejected", "Ignored"].includes(item.tracking_status || "New")).length,
    recoveredThisMonth,
    recoveredThisYear,
    funnel: statuses.map((status) => ({ status, count: statusCounts[status] || 0 })),
    topRecoveryCategories: Array.from(categoryMap.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
    topRecoveryOwners: Array.from(ownerMap.entries())
      .map(([owner, value]) => ({ owner, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
  };
}

export async function getRecoveryAuditSummary(limit = 20): Promise<RecoveryAuditSummaryRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("vyron_recovery_audit_trail")
    .select("opportunity_key, changed_by, changed_at, field_name, old_value, new_value")
    .order("changed_at", { ascending: false })
    .limit(limit);
  return (data || []) as RecoveryAuditSummaryRow[];
}

export async function getRecoveryExecutiveSummary(): Promise<RecoveryExecutiveSummary> {
  const rows = await getRecoveryCalculationsV2();
  if (!rows.length) {
    const opportunities = await generateCalculatedRecoveryOpportunities();
    const estimated = opportunities.reduce((sum, row) => sum + Number(row.monthly_value || 0), 0);
    return {
      estimatedRecovery: estimated,
      verifiedRecovery: 0,
      potentialRecovery: estimated,
      recoveredToDate: 0,
    };
  }
  return buildRecoveryExecutiveSummary(rows);
}

export const demoRecoveryOpportunities: RecoveryOpportunity[] = [
  {
    id: "demo-recovery-1",
    opportunity_type: "Margin Recovery",
    title: "Chicken & Mushroom Pie below target GP",
    description: "Current GP is below target. Suggested selling price should be reviewed.",
    formula: "Monthly Recovery = (Suggested Selling Price - Current Selling Price) × Estimated Monthly Units",
    monthly_value: 3200,
    annual_value: 38400,
    confidence: 78,
    status: "Identified",
    product_name: "Chicken & Mushroom Pie",
    recommended_action: "Increase price or reduce BOM cost.",
    data_source: "Demo product GP calculation",
  },
  {
    id: "demo-recovery-2",
    opportunity_type: "Supplier Recovery",
    title: "Meat Supplier price movement detected",
    description: "Supplier movement above 5% may be reducing product margins.",
    formula: "Monthly Recovery = Estimated Monthly Supplier Spend × Price Movement %",
    monthly_value: 2600,
    annual_value: 31200,
    confidence: 72,
    status: "Identified",
    supplier_name: "Meat Supplier",
    recommended_action: "Negotiate price or compare alternate suppliers.",
    data_source: "Demo supplier movement calculation",
  },
];
