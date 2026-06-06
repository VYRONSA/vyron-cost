import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDescription } from "@/lib/vyron-document-review";

export type SuggestedMatchReason = "sku" | "description_exact" | "description_similar" | "remembered";

export type SuggestedLineMatch = {
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  confidence: number;
  matchReason: SuggestedMatchReason;
  mappingId: string | null;
};

export type SupplierLineMappingRecord = {
  id: string;
  tenant_id: string;
  supplier_name: string;
  supplier_vat_number: string | null;
  source_description: string;
  source_description_normalized: string;
  source_sku: string | null;
  source_sku_normalized: string | null;
  unit: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  last_approved_price: number | null;
  confidence_score: number;
  approved_by: string | null;
  approved_at: string | null;
  usage_count: number;
  last_seen_at: string;
  disabled: boolean;
  match_source: string | null;
};

export type PersistLineMappingInput = {
  description: string;
  skuOrProductCode?: string | null;
  unit?: string | null;
  unitPrice?: number | null;
  matchedEntityType: "ingredient" | "packaging" | "product" | null;
  matchedEntityId: string | null;
  matchedEntityName: string | null;
  ignored?: boolean;
};

export function normalizeSku(value: string | null | undefined) {
  if (!value?.trim()) return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeUnit(value: string | null | undefined) {
  if (!value?.trim()) return "";
  return value.trim().toLowerCase();
}

function tokenize(value: string) {
  return normalizeDescription(value).split(" ").filter(Boolean);
}

function descriptionSimilarity(left: string, right: string) {
  const a = normalizeDescription(left);
  const b = normalizeDescription(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  if (!wordsA.size || !wordsB.size) return 0;
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap += 1;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function unitMatches(mappingUnit: string | null, lineUnit: string | null) {
  const left = normalizeUnit(mappingUnit);
  const right = normalizeUnit(lineUnit);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function boostConfidence(base: number, unitMatch: boolean) {
  const boosted = base + (unitMatch ? 8 : 0);
  return Math.min(100, Math.max(0, Math.round(boosted)));
}

export function findBestSupplierLineMatch(
  mappings: SupplierLineMappingRecord[],
  description: string,
  sku: string | null | undefined,
  unit: string | null | undefined
): SuggestedLineMatch | null {
  const active = mappings.filter((row) => !row.disabled && row.entity_id);
  if (!active.length) return null;

  const descNorm = normalizeDescription(description);
  const skuNorm = normalizeSku(sku);
  const lineUnit = unit ?? null;

  if (skuNorm) {
    const skuHit = active.find((row) => row.source_sku_normalized === skuNorm);
    if (skuHit) {
      const unitMatch = unitMatches(skuHit.unit, lineUnit);
      return {
        entityType: skuHit.entity_type,
        entityId: skuHit.entity_id,
        entityName: skuHit.entity_name,
        confidence: boostConfidence(Number(skuHit.confidence_score || 90), unitMatch),
        matchReason: "sku",
        mappingId: skuHit.id,
      };
    }
  }

  if (descNorm) {
    const exact = active.find((row) => row.source_description_normalized === descNorm);
    if (exact) {
      const unitMatch = unitMatches(exact.unit, lineUnit);
      return {
        entityType: exact.entity_type,
        entityId: exact.entity_id,
        entityName: exact.entity_name,
        confidence: boostConfidence(Number(exact.confidence_score || 88), unitMatch),
        matchReason: "description_exact",
        mappingId: exact.id,
      };
    }
  }

  let best: { row: SupplierLineMappingRecord; score: number } | null = null;
  for (const row of active) {
    const score = descriptionSimilarity(description, row.source_description);
    if (score < 0.55) continue;
    if (!best || score > best.score) {
      best = { row, score };
    }
  }

  if (best) {
    const unitMatch = unitMatches(best.row.unit, lineUnit);
    const base = Math.round(best.score * 85);
    return {
      entityType: best.row.entity_type,
      entityId: best.row.entity_id,
      entityName: best.row.entity_name,
      confidence: boostConfidence(base, unitMatch),
      matchReason: "description_similar",
      mappingId: best.row.id,
    };
  }

  return null;
}

export async function loadSupplierLineMappings(
  supabase: SupabaseClient,
  tenantId: string,
  supplierName: string | null
): Promise<SupplierLineMappingRecord[]> {
  if (!supplierName?.trim()) return [];
  const { data, error } = await supabase
    .from("vyron_supplier_line_item_mappings")
    .select(
      "id, tenant_id, supplier_name, supplier_vat_number, source_description, source_description_normalized, source_sku, source_sku_normalized, unit, entity_type, entity_id, entity_name, last_approved_price, confidence_score, approved_by, approved_at, usage_count, last_seen_at, disabled, match_source"
    )
    .eq("tenant_id", tenantId)
    .eq("supplier_name", supplierName)
    .eq("disabled", false)
    .order("usage_count", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data || []) as SupplierLineMappingRecord[];
}

export async function getSuggestedMapping(
  supabase: SupabaseClient,
  tenantId: string,
  supplierName: string | null,
  description: string,
  sku?: string | null,
  unit?: string | null
): Promise<SuggestedLineMatch | null> {
  const mappings = await loadSupplierLineMappings(supabase, tenantId, supplierName);
  return findBestSupplierLineMatch(mappings, description, sku, unit);
}

async function fetchExistingMapping(
  supabase: SupabaseClient,
  tenantId: string,
  supplierName: string,
  descriptionNormalized: string
) {
  const { data } = await supabase
    .from("vyron_supplier_line_item_mappings")
    .select(
      "id, entity_type, entity_id, entity_name, last_approved_price, source_sku, source_sku_normalized, unit, disabled, usage_count, approved_at"
    )
    .eq("tenant_id", tenantId)
    .eq("supplier_name", supplierName)
    .eq("source_description_normalized", descriptionNormalized)
    .maybeSingle();
  return data;
}

async function insertMappingHistory(
  supabase: SupabaseClient,
  entry: {
    mappingId: string | null;
    tenantId: string;
    supplierName: string;
    supplierVatNumber: string | null;
    sourceDescription: string;
    sourceSku: string | null;
    unit: string | null;
    changeType: string;
    previous?: {
      entityType: string | null;
      entityId: string | null;
      entityName: string | null;
      lastApprovedPrice: number | null;
    };
    next: {
      entityType: string;
      entityId: string | null;
      entityName: string | null;
      lastApprovedPrice: number | null;
    };
    confidenceScore: number;
    approvedBy: string | null;
    documentId: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("vyron_supplier_line_item_mapping_history").insert({
    mapping_id: entry.mappingId,
    tenant_id: entry.tenantId,
    supplier_name: entry.supplierName,
    supplier_vat_number: entry.supplierVatNumber,
    source_description: entry.sourceDescription,
    source_sku: entry.sourceSku,
    unit: entry.unit,
    change_type: entry.changeType,
    previous_entity_type: entry.previous?.entityType ?? null,
    previous_entity_id: entry.previous?.entityId ?? null,
    previous_entity_name: entry.previous?.entityName ?? null,
    previous_last_approved_price: entry.previous?.lastApprovedPrice ?? null,
    new_entity_type: entry.next.entityType,
    new_entity_id: entry.next.entityId,
    new_entity_name: entry.next.entityName,
    new_last_approved_price: entry.next.lastApprovedPrice,
    confidence_score: entry.confidenceScore,
    approved_by: entry.approvedBy,
    document_id: entry.documentId,
    metadata: entry.metadata || {},
  });
}

export async function persistSupplierLineMappings(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    supplierName: string;
    supplierVatNumber?: string | null;
    documentId?: string | null;
    approvedBy: string;
    isApproval: boolean;
    lines: PersistLineMappingInput[];
  }
) {
  const now = new Date().toISOString();
  const { tenantId, supplierName, supplierVatNumber, documentId, approvedBy, isApproval, lines } = params;

  for (const line of lines) {
    if (line.ignored || !line.matchedEntityType || !line.matchedEntityId || !line.description?.trim()) {
      continue;
    }

    const descNorm = normalizeDescription(line.description);
    const skuNorm = normalizeSku(line.skuOrProductCode);
    const unit = normalizeUnit(line.unit) || null;
    const lastPrice = line.unitPrice !== null && line.unitPrice !== undefined ? Number(line.unitPrice) : null;
    const confidence = isApproval ? 95 : 85;
    const matchSource =
      skuNorm && descNorm ? "sku_and_description" : skuNorm ? "sku" : descNorm ? "description" : "manual";

    const existing = await fetchExistingMapping(supabase, tenantId, supplierName, descNorm);
    const entityChanged =
      existing &&
      (String(existing.entity_id || "") !== String(line.matchedEntityId) ||
        String(existing.entity_type || "") !== String(line.matchedEntityType));

    if (existing && entityChanged) {
      await insertMappingHistory(supabase, {
        mappingId: existing.id as string,
        tenantId,
        supplierName,
        supplierVatNumber: supplierVatNumber ?? null,
        sourceDescription: line.description,
        sourceSku: line.skuOrProductCode || null,
        unit,
        changeType: "remapped",
        previous: {
          entityType: (existing.entity_type as string) || null,
          entityId: (existing.entity_id as string | null) ?? null,
          entityName: (existing.entity_name as string | null) ?? null,
          lastApprovedPrice: existing.last_approved_price !== null ? Number(existing.last_approved_price) : null,
        },
        next: {
          entityType: line.matchedEntityType,
          entityId: line.matchedEntityId,
          entityName: line.matchedEntityName,
          lastApprovedPrice: lastPrice,
        },
        confidenceScore: confidence,
        approvedBy,
        documentId: documentId ?? null,
        metadata: { trigger: isApproval ? "approval" : "save_draft" },
      });
    }

    const nextUsage = existing ? Number(existing.usage_count || 0) + 1 : 1;

    const row = {
      tenant_id: tenantId,
      supplier_name: supplierName,
      supplier_vat_number: supplierVatNumber ?? null,
      source_description: line.description,
      source_description_normalized: descNorm,
      source_sku: line.skuOrProductCode?.trim() || null,
      source_sku_normalized: skuNorm || null,
      unit,
      entity_type: line.matchedEntityType,
      entity_id: line.matchedEntityId,
      entity_name: line.matchedEntityName,
      last_approved_price: lastPrice,
      confidence_score: confidence,
      approved_by: approvedBy,
      approved_at: isApproval ? now : (existing?.approved_at as string | null) ?? now,
      last_document_id: documentId ?? null,
      last_seen_at: now,
      disabled: false,
      match_source: matchSource,
      usage_count: nextUsage,
      updated_at: now,
    };

    const { data: upserted, error } = await supabase
      .from("vyron_supplier_line_item_mappings")
      .upsert(row, { onConflict: "tenant_id,supplier_name,source_description_normalized" })
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[supplier-learning] mapping upsert failed", error.message);
      continue;
    }

    if (!existing && upserted?.id) {
      await insertMappingHistory(supabase, {
        mappingId: upserted.id as string,
        tenantId,
        supplierName,
        supplierVatNumber: supplierVatNumber ?? null,
        sourceDescription: line.description,
        sourceSku: line.skuOrProductCode || null,
        unit,
        changeType: "created",
        next: {
          entityType: line.matchedEntityType,
          entityId: line.matchedEntityId,
          entityName: line.matchedEntityName,
          lastApprovedPrice: lastPrice,
        },
        confidenceScore: confidence,
        approvedBy,
        documentId: documentId ?? null,
        metadata: { trigger: isApproval ? "approval" : "save_draft" },
      });
    }
  }
}

export async function listSupplierLineMappings(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { supplierName?: string; includeDisabled?: boolean }
) {
  let query = supabase
    .from("vyron_supplier_line_item_mappings")
    .select(
      "id, supplier_name, supplier_vat_number, source_description, source_sku, unit, entity_type, entity_id, entity_name, last_approved_price, confidence_score, approved_by, approved_at, usage_count, last_seen_at, disabled, match_source"
    )
    .eq("tenant_id", tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (options?.supplierName) {
    query = query.eq("supplier_name", options.supplierName);
  }
  if (!options?.includeDisabled) {
    query = query.eq("disabled", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listSupplierNamesWithMappings(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("vyron_supplier_line_item_mappings")
    .select("supplier_name, last_seen_at, confidence_score, disabled")
    .eq("tenant_id", tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const bySupplier = new Map<
    string,
    { supplierName: string; mappingCount: number; activeCount: number; lastUsedAt: string | null; avgConfidence: number }
  >();

  for (const row of data || []) {
    const name = String(row.supplier_name || "");
    if (!name) continue;
    const existing = bySupplier.get(name) || {
      supplierName: name,
      mappingCount: 0,
      activeCount: 0,
      lastUsedAt: null,
      avgConfidence: 0,
    };
    existing.mappingCount += 1;
    if (!row.disabled) existing.activeCount += 1;
    const seen = String(row.last_seen_at || "");
    if (seen && (!existing.lastUsedAt || seen > existing.lastUsedAt)) {
      existing.lastUsedAt = seen;
    }
    existing.avgConfidence += Number(row.confidence_score || 0);
    bySupplier.set(name, existing);
  }

  return [...bySupplier.values()]
    .map((row) => ({
      ...row,
      avgConfidence: row.mappingCount ? Math.round(row.avgConfidence / row.mappingCount) : 0,
    }))
    .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")));
}

export async function updateSupplierLineMapping(
  supabase: SupabaseClient,
  tenantId: string,
  mappingId: string,
  patch: {
    entityType?: "ingredient" | "packaging" | "product";
    entityId?: string | null;
    entityName?: string | null;
    disabled?: boolean;
    sourceDescription?: string;
    unit?: string | null;
    approvedBy?: string;
  }
) {
  const { data: existing, error: loadError } = await supabase
    .from("vyron_supplier_line_item_mappings")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", mappingId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Mapping not found.");

  const nextEntityType = patch.entityType ?? (existing.entity_type as string);
  const nextEntityId = patch.entityId !== undefined ? patch.entityId : (existing.entity_id as string | null);
  const nextEntityName = patch.entityName ?? (existing.entity_name as string | null);
  const nextDisabled = patch.disabled ?? Boolean(existing.disabled);
  const nextDescription = patch.sourceDescription?.trim() || String(existing.source_description || "");
  const nextUnit = patch.unit !== undefined ? patch.unit : (existing.unit as string | null);
  const descNorm = normalizeDescription(nextDescription);
  const approvedBy = patch.approvedBy || "supplier-learning-admin";
  const now = new Date().toISOString();

  const entityChanged =
    String(existing.entity_id || "") !== String(nextEntityId || "") ||
    String(existing.entity_type || "") !== String(nextEntityType);

  if (entityChanged || nextDisabled !== Boolean(existing.disabled)) {
    await insertMappingHistory(supabase, {
      mappingId,
      tenantId,
      supplierName: String(existing.supplier_name),
      supplierVatNumber: (existing.supplier_vat_number as string | null) ?? null,
      sourceDescription: nextDescription,
      sourceSku: (existing.source_sku as string | null) ?? null,
      unit: nextUnit,
      changeType: nextDisabled ? "disabled" : entityChanged ? "updated" : "updated",
      previous: {
        entityType: (existing.entity_type as string) || null,
        entityId: (existing.entity_id as string | null) ?? null,
        entityName: (existing.entity_name as string | null) ?? null,
        lastApprovedPrice:
          existing.last_approved_price !== null ? Number(existing.last_approved_price) : null,
      },
      next: {
        entityType: nextEntityType,
        entityId: nextEntityId,
        entityName: nextEntityName,
        lastApprovedPrice:
          existing.last_approved_price !== null ? Number(existing.last_approved_price) : null,
      },
      confidenceScore: Number(existing.confidence_score || 0),
      approvedBy,
      documentId: (existing.last_document_id as string | null) ?? null,
      metadata: { source: "supplier_learning_page" },
    });
  }

  const { data, error } = await supabase
    .from("vyron_supplier_line_item_mappings")
    .update({
      source_description: nextDescription,
      source_description_normalized: descNorm,
      unit: nextUnit,
      entity_type: nextEntityType,
      entity_id: nextEntityId,
      entity_name: nextEntityName,
      disabled: nextDisabled,
      updated_at: now,
      approved_by: approvedBy,
      approved_at: now,
    })
    .eq("id", mappingId)
    .eq("tenant_id", tenantId)
    .select(
      "id, supplier_name, supplier_vat_number, source_description, source_sku, unit, entity_type, entity_id, entity_name, last_approved_price, confidence_score, approved_by, approved_at, usage_count, last_seen_at, disabled"
    )
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
