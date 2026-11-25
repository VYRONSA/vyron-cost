import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOM_OVERRIDE_MIN_REASON,
  BOM_OVERRIDE_TABLE,
  getBomCompletenessReport,
  isMissingOverrideTable,
} from "@/lib/vyron-bom-completeness";

/**
 * BOM Completeness overrides — server writes.
 *
 * The classification being overridden is ALWAYS re-derived here from the
 * database; nothing the browser sends about the BOM's state is trusted. The
 * override row and its audit event are written together: if the audit record
 * cannot be written the override is undone, so no override exists without an
 * audit trail. Nothing in the BOM, its lines, the ingredients or the product is
 * touched.
 */

export const BOM_OVERRIDE_PERMISSION = "boms.completeness_override";

export class BomOverrideError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BomOverrideError";
    this.status = status;
  }
}

export type OverrideActor = { id: string; name: string };

function tableMissing(message: string): never {
  throw new BomOverrideError(
    `Overrides cannot be recorded yet: the ${BOM_OVERRIDE_TABLE} table has not been created in this database (${message}).`,
    503
  );
}

async function writeAudit(
  supabase: SupabaseClient,
  companyId: string,
  actor: OverrideActor,
  event: "bom_completeness_override_added" | "bom_completeness_override_removed",
  overrideId: string,
  detail: string,
  metadata: Record<string, unknown>,
  oldValue: string | null,
  newValue: string | null
) {
  const { error } = await supabase.from("vyron_inventory_audit_log").insert({
    company_id: companyId,
    stock_item_id: null,
    event_type: event,
    actor: actor.name || actor.id,
    field_name: "bom_completeness_classification",
    old_value: oldValue,
    new_value: newValue,
    detail,
    reference_type: "bom_completeness_override",
    reference_id: overrideId,
    metadata: { ...metadata, actorId: actor.id, at: new Date().toISOString() },
  });
  return error;
}

export async function createBomCompletenessOverride(
  supabase: SupabaseClient,
  companyId: string,
  actor: OverrideActor,
  input: { productId: string; reason: string }
) {
  const productId = String(input.productId || "").trim();
  const reason = String(input.reason || "").trim();
  if (!productId) throw new BomOverrideError("Choose the finished good to override.");
  if (reason.length < BOM_OVERRIDE_MIN_REASON) {
    throw new BomOverrideError(`Give a reason of at least ${BOM_OVERRIDE_MIN_REASON} characters explaining why the BOM is valid.`);
  }

  // Re-derive the classification from the database. Never trust the client.
  const report = await getBomCompletenessReport(supabase, companyId);
  if (report.overridesAvailable === false) tableMissing("table not found");
  const row = report.rows.find((r) => r.productId === productId);
  if (!row) throw new BomOverrideError("That finished good is not an active finished good of this company.", 404);
  if (row.bomStatus === "COMPLETE") {
    throw new BomOverrideError("This BOM is already system-verified complete; there is nothing to override.", 409);
  }
  if (row.override) {
    throw new BomOverrideError(`An override is already active (recorded by ${row.override.createdBy}). Remove it first.`, 409);
  }

  const { data, error } = await supabase
    .from(BOM_OVERRIDE_TABLE)
    .insert({
      company_id: companyId,
      product_id: productId,
      bom_id: row.bomId,
      original_status: row.bomStatus,
      original_severity: row.severity,
      original_reason: row.classificationReason.slice(0, 4000),
      reason,
      created_by: actor.name || actor.id,
      created_by_user_id: actor.id,
    })
    .select("id, created_at")
    .single();
  if (error) {
    if (isMissingOverrideTable(error.message) || error.code === "PGRST205" || error.code === "42P01") tableMissing(error.message);
    // 23505: the partial unique index — another user overrode it at the same moment.
    if (error.code === "23505") throw new BomOverrideError("Another user has just overridden this BOM. Refresh the report.", 409);
    throw new Error(`The override could not be saved: ${error.message}`);
  }

  const auditError = await writeAudit(
    supabase,
    companyId,
    actor,
    "bom_completeness_override_added",
    String(data.id),
    `BOM completeness override for "${row.productName}" (${row.productCode ?? "no code"}): system classification ${row.bomStatus} (${row.severity}) reported as Manually Overridden. Reason: ${reason}. BOM, ingredients, costing and stock deduction unchanged.`,
    {
      productId,
      productName: row.productName,
      bomId: row.bomId,
      bomName: row.bomName,
      originalStatus: row.bomStatus,
      originalSeverity: row.severity,
      originalReason: row.classificationReason,
      exceptions: row.exceptions.map((e) => e.code),
      reason,
    },
    row.bomStatus,
    "MANUALLY OVERRIDDEN"
  );
  if (auditError) {
    await supabase.from(BOM_OVERRIDE_TABLE).delete().eq("id", data.id).eq("company_id", companyId);
    throw new Error(`The audit record could not be written, so the override was not saved: ${auditError.message}`);
  }
  return { id: String(data.id), createdAt: String(data.created_at), productId, originalStatus: row.bomStatus };
}

export async function removeBomCompletenessOverride(
  supabase: SupabaseClient,
  companyId: string,
  actor: OverrideActor,
  input: { overrideId: string; reason: string }
) {
  const overrideId = String(input.overrideId || "").trim();
  const reason = String(input.reason || "").trim();
  if (!overrideId) throw new BomOverrideError("Choose the override to remove.");
  if (reason.length < 5) throw new BomOverrideError("Give a reason for removing the override.");

  const { data: existing, error: readError } = await supabase
    .from(BOM_OVERRIDE_TABLE)
    .select("id, product_id, original_status, reason, created_by, removed_at")
    .eq("id", overrideId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (readError) {
    if (isMissingOverrideTable(readError.message) || readError.code === "PGRST205") tableMissing(readError.message);
    throw new Error(readError.message);
  }
  if (!existing) throw new BomOverrideError("Override not found.", 404);
  if (existing.removed_at) throw new BomOverrideError("This override has already been removed.", 409);

  const removedAt = new Date().toISOString();
  // Conditional update: only an ACTIVE override can be removed, exactly once.
  const { data: updated, error } = await supabase
    .from(BOM_OVERRIDE_TABLE)
    .update({ removed_at: removedAt, removed_by: actor.name || actor.id, removed_by_user_id: actor.id, removal_reason: reason })
    .eq("id", overrideId)
    .eq("company_id", companyId)
    .is("removed_at", null)
    .select("id");
  if (error) throw new Error(`The override could not be removed: ${error.message}`);
  if (!updated || updated.length === 0) throw new BomOverrideError("This override has already been removed.", 409);

  const auditError = await writeAudit(
    supabase,
    companyId,
    actor,
    "bom_completeness_override_removed",
    overrideId,
    `BOM completeness override removed for product ${existing.product_id} (was recorded by ${existing.created_by} against ${existing.original_status}). Removal reason: ${reason}. The report reverts to the system classification.`,
    { productId: existing.product_id, originalStatus: existing.original_status, overrideReason: existing.reason, removalReason: reason },
    "MANUALLY OVERRIDDEN",
    existing.original_status
  );
  if (auditError) {
    await supabase
      .from(BOM_OVERRIDE_TABLE)
      .update({ removed_at: null, removed_by: null, removed_by_user_id: null, removal_reason: null })
      .eq("id", overrideId)
      .eq("company_id", companyId);
    throw new Error(`The audit record could not be written, so the override was not removed: ${auditError.message}`);
  }
  return { id: overrideId, removedAt };
}
