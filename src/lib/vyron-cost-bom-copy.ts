import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildDocumentStoragePath, VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import { normaliseBomPurpose, type BomPurpose } from "@/lib/vyron-cost-sub-boms";

/**
 * Copy a BOM into a completely independent one.
 *
 * WHAT IS COPIED, AND WHY EACH CHOICE
 * The structure: header, components, lines, quantities, unit costs, wastage,
 * ordering, notes, yield and target GP. Components are recreated with new ids,
 * because a component belongs to exactly one BOM — sharing the record would mean
 * renaming a component in the copy renamed it in the original.
 *
 * Ingredients are *not* duplicated. An ingredient is a shared master record:
 * both BOMs referring to frozen salmon should refer to the same frozen salmon,
 * and its cost should move for both when it is repriced.
 *
 * Child BOM references are kept as references. Copying a parent copies the
 * parent's structure, not the whole tree beneath it — two packs can legitimately
 * be built from the same assembly, and duplicating it would silently create a
 * second one nobody asked for that then drifts from the first.
 *
 * WHAT IS NOT COPIED
 * product_id, the finished-goods stock item, stock, ledger rows, inventory
 * transactions and production runs. Those belong to the original product's
 * identity and history; a copy is a new thing that has produced nothing yet. The
 * copy starts with product_id null unless the caller assigns one.
 *
 * FAILURE
 * Anything that fails rolls the whole copy back — the BOM row, its components,
 * its lines and any storage object already uploaded — so a half-built BOM is
 * never left behind.
 */

export type CopyBomInput = {
  newName: string;
  purpose?: string | null;
  /** Only meaningful for a Finished Good copy; ignored for a Sub-BOM. */
  productId?: string | null;
  copyImage?: boolean;
};

export type CopyBomResult = {
  id: string;
  bom_name: string;
  bom_purpose: BomPurpose;
  product_id: string | null;
  componentCount: number;
  lineCount: number;
  imageCopied: boolean;
};

/**
 * Copy a BOM's pack photo onto another BOM.
 *
 * The copy always gets a storage path of its own, so two BOMs never share an
 * object and removing one photo can never blank the other. Returns the new path
 * so a caller that is mid-transaction can undo the upload if a later step fails.
 *
 * Both BOMs are read scoped to the company, so this cannot reach another
 * tenant's photo or attach one to another tenant's BOM.
 */
export async function copyBomImage(
  supabase: SupabaseClient,
  companyId: string,
  source: { image_bucket?: string | null; image_path?: string | null; image_mime?: string | null },
  targetBomId: string
): Promise<string | null> {
  if (!source.image_path) return null;

  const bucket = String(source.image_bucket || VYRON_DOCUMENTS_BUCKET);
  const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(source.image_path);
  if (dlErr || !blob) throw new Error(`Could not read the original pack photo: ${dlErr?.message ?? "not found"}`);
  const bytes = Buffer.from(await blob.arrayBuffer());

  const fileName = String(source.image_path).split("/").pop() || "pack-photo";
  const path = buildDocumentStoragePath(companyId, `bom-${targetBomId}-${randomUUID()}`, fileName);
  const up = await supabase.storage.from(VYRON_DOCUMENTS_BUCKET).upload(path, bytes, {
    contentType: String(source.image_mime || "image/jpeg"),
    upsert: false,
  });
  if (up.error) throw new Error(`Could not copy the pack photo: ${up.error.message}`);

  const { error: refErr } = await supabase
    .from("vyron_cost_boms")
    .update({
      image_bucket: VYRON_DOCUMENTS_BUCKET,
      image_path: path,
      image_mime: source.image_mime || "image/jpeg",
    })
    .eq("id", targetBomId)
    .eq("company_id", companyId);
  if (refErr) {
    await supabase.storage.from(VYRON_DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    throw new Error(refErr.message);
  }
  return path;
}

export async function copyBom(
  supabase: SupabaseClient,
  companyId: string,
  sourceBomId: string,
  input: CopyBomInput
): Promise<CopyBomResult> {
  const name = String(input.newName || "").trim();
  if (!name) throw new Error("Give the new BOM a name.");

  const purpose = normaliseBomPurpose(input.purpose);

  // Everything is read scoped to the company, so another tenant's BOM is simply
  // not found and cannot be copied.
  const { data: source, error: srcErr } = await supabase
    .from("vyron_cost_boms")
    .select("*")
    .eq("id", sourceBomId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (srcErr) throw new Error(srcErr.message);
  if (!source) throw new Error("BOM not found.");

  const [{ data: components, error: compErr }, { data: lines, error: lineErr }] = await Promise.all([
    supabase
      .from("vyron_cost_bom_components")
      .select("*")
      .eq("company_id", companyId)
      .eq("bom_id", sourceBomId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("vyron_cost_bom_lines")
      .select("*")
      .eq("company_id", companyId)
      .eq("bom_id", sourceBomId)
      .order("sort_order", { ascending: true }),
  ]);
  if (compErr) throw new Error(compErr.message);
  if (lineErr) throw new Error(lineErr.message);

  const newBomId = randomUUID();
  const createdComponentIds: string[] = [];
  let uploadedImagePath: string | null = null;

  async function rollback() {
    if (uploadedImagePath) {
      await supabase.storage.from(VYRON_DOCUMENTS_BUCKET).remove([uploadedImagePath]).catch(() => {});
    }
    await supabase.from("vyron_cost_bom_lines").delete().eq("bom_id", newBomId).eq("company_id", companyId);
    if (createdComponentIds.length) {
      await supabase
        .from("vyron_cost_bom_components")
        .delete()
        .in("id", createdComponentIds)
        .eq("company_id", companyId);
    }
    await supabase.from("vyron_cost_boms").delete().eq("id", newBomId).eq("company_id", companyId);
  }

  try {
    const { error: headErr } = await supabase.from("vyron_cost_boms").insert({
      id: newBomId,
      company_id: companyId,
      bom_name: name,
      category: source.category,
      yield_qty: source.yield_qty,
      yield_unit: source.yield_unit,
      target_gp: source.target_gp,
      markup_percent: source.markup_percent,
      selling_price: source.selling_price,
      // The costing fields are copied because the structure is identical; a save
      // through updateRecipe recomputes them from the lines either way.
      total_cost: source.total_cost,
      ingredient_cost: source.ingredient_cost,
      packaging_cost: source.packaging_cost,
      cost_per_unit: source.cost_per_unit,
      calculated_gp: source.calculated_gp,
      suggested_selling_price: source.suggested_selling_price,
      status: source.status,
      notes: source.notes,
      bom_purpose: purpose,
      // Never inherited. A copy has produced nothing and is nobody's product.
      product_id: purpose === "Sub-BOM" ? null : input.productId || null,
    });
    if (headErr) throw new Error(headErr.message);

    // New component ids, so editing the copy can never reach the original.
    const componentIdMap = new Map<string, string>();
    if (components?.length) {
      const rows = components.map((c) => {
        const id = randomUUID();
        componentIdMap.set(String(c.id), id);
        createdComponentIds.push(id);
        return {
          id,
          company_id: companyId,
          bom_id: newBomId,
          name: c.name,
          component_type: c.component_type,
          sort_order: c.sort_order,
          yield_qty: c.yield_qty,
          yield_unit: c.yield_unit,
          notes: c.notes,
        };
      });
      const { error } = await supabase.from("vyron_cost_bom_components").insert(rows);
      if (error) throw new Error(error.message);
    }

    if (lines?.length) {
      const rows = lines.map((l) => ({
        id: randomUUID(),
        company_id: companyId,
        bom_id: newBomId,
        line_type: l.line_type,
        // Shared master record — deliberately the same ingredient.
        ingredient_id: l.ingredient_id,
        // Shared child BOM — the copy uses the same assembly.
        child_bom_id: l.child_bom_id,
        component_id: l.component_id ? componentIdMap.get(String(l.component_id)) ?? null : null,
        line_name: l.line_name,
        quantity: l.quantity,
        unit: l.unit,
        unit_cost: l.unit_cost,
        wastage_percent: l.wastage_percent,
        sort_order: l.sort_order,
      }));
      const { error } = await supabase.from("vyron_cost_bom_lines").insert(rows);
      if (error) throw new Error(error.message);
    }

    let imageCopied = false;
    if (input.copyImage && source.image_path) {
      uploadedImagePath = await copyBomImage(supabase, companyId, source, newBomId);
      imageCopied = Boolean(uploadedImagePath);
    }

    return {
      id: newBomId,
      bom_name: name,
      bom_purpose: purpose,
      product_id: purpose === "Sub-BOM" ? null : input.productId || null,
      componentCount: components?.length ?? 0,
      lineCount: lines?.length ?? 0,
      imageCopied,
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}
