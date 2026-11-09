import type { SupabaseClient } from "@supabase/supabase-js";
import { renameStockItemsForEntity } from "@/lib/vyron-inventory";

/**
 * Carry a raw material's new name into every record that keeps a copy of it.
 *
 * Several tables store the ingredient's name as text next to its id (BOM lines,
 * calculator lines, stock items, purchase order lines, production run lines,
 * supplier line mappings, invoice lines under review). Renaming the ingredient
 * used to change only the master, so costing, production, stock and reports
 * kept showing the old name (Kingdom Foods, 2026-11).
 *
 * Everything still in use is renamed: BOMs, recipes, stock, mappings, and
 * purchase orders, production runs and invoice reviews that are still open.
 * Finished records — approved invoices, completed runs, received or closed
 * purchase orders, the stock ledger and price history — keep the name they
 * were recorded under: they are what happened, and they are found by id.
 * Every update is scoped to the company and to the ingredient's id; the
 * supplier's own invoice wording is never changed.
 */
const CLOSED_PO_STATUSES = new Set(["Fully Received", "Closed", "Cancelled", "Rejected"]);
const FINISHED_RUN_STATUSES = new Set(["Completed", "Cancelled", "Reversed"]);

export type IngredientRenameResult = Record<string, number>;

export async function cascadeIngredientRename(
  supabase: SupabaseClient,
  companyId: string,
  ingredientId: string,
  newName: string
): Promise<IngredientRenameResult> {
  const name = newName.trim();
  const result: IngredientRenameResult = {};
  if (!name) return result;

  const run = async (label: string, query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) => {
    const { data, error } = await query;
    if (error) throw new Error(`${label}: ${error.message}`);
    result[label] = (data || []).length;
  };

  await run("bomLines", supabase.from("vyron_cost_bom_lines").update({ line_name: name }).eq("company_id", companyId).eq("ingredient_id", ingredientId).select("id"));
  // Product cost lines are linked by ingredient_id since migration 20261102120000; before it is applied there is no link to follow.
  {
    const { data, error } = await supabase.from("vyron_cost_product_cost_lines").update({ line_name: name }).eq("company_id", companyId).eq("ingredient_id", ingredientId).select("id");
    if (error && !(/ingredient_id/i.test(error.message) && /(does not exist|schema cache|could not find)/i.test(error.message))) throw new Error(`productCostLines: ${error.message}`);
    result.productCostLines = error ? 0 : (data || []).length;
  }
  await run("recipeItems", supabase.from("vyron_cost_recipe_items").update({ ingredient_name_snapshot: name }).eq("company_id", companyId).eq("ingredient_id", ingredientId).select("id"));
  try {
    result.stockItems = await renameStockItemsForEntity(supabase, companyId, ["ingredient", "packaging"], ingredientId, name);
  } catch (error) {
    throw new Error(`stockItems: ${error instanceof Error ? error.message : String(error)}`);
  }
  await run(
    "supplierLineMappings",
    supabase.from("vyron_supplier_line_item_mappings").update({ entity_name: name }).eq("tenant_id", companyId).in("entity_type", ["ingredient", "packaging"]).eq("entity_id", ingredientId).select("id")
  );

  // Purchase order lines: only on orders still open.
  const { data: poLines, error: poLineError } = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("id, purchase_order_id, item_type, item_id, ingredient_id")
    .eq("company_id", companyId)
    .or(`item_id.eq.${ingredientId},ingredient_id.eq.${ingredientId}`);
  if (poLineError) throw new Error(`purchaseOrderLines: ${poLineError.message}`);
  const linked = (poLines || []).filter((l: { item_type?: string | null; ingredient_id?: string | null }) => l.ingredient_id === ingredientId || ["ingredient", "packaging"].includes(String(l.item_type || "ingredient")));
  const poIds = [...new Set(linked.map((l: { purchase_order_id: string }) => String(l.purchase_order_id)))];
  let openPoIds = new Set<string>();
  if (poIds.length) {
    const { data: pos, error } = await supabase.from("vyron_cost_purchase_orders").select("id, status").eq("company_id", companyId).in("id", poIds);
    if (error) throw new Error(`purchaseOrders: ${error.message}`);
    openPoIds = new Set((pos || []).filter((p: { status?: string | null }) => !CLOSED_PO_STATUSES.has(String(p.status || ""))).map((p: { id: string }) => String(p.id)));
  }
  const openLineIds = linked.filter((l: { purchase_order_id: string }) => openPoIds.has(String(l.purchase_order_id))).map((l: { id: string }) => String(l.id));
  result.purchaseOrderLines = 0;
  if (openLineIds.length) await run("purchaseOrderLines", supabase.from("vyron_cost_purchase_order_lines").update({ item_name: name }).eq("company_id", companyId).in("id", openLineIds).select("id"));

  // Production run lines: only on runs not yet finished.
  const { data: runLines, error: runLineError } = await supabase.from("vyron_cost_production_run_lines").select("id, production_run_id").eq("company_id", companyId).eq("ingredient_id", ingredientId);
  if (runLineError) throw new Error(`productionRunLines: ${runLineError.message}`);
  const runIds = [...new Set((runLines || []).map((l: { production_run_id: string }) => String(l.production_run_id)))];
  let openRunIds = new Set<string>();
  if (runIds.length) {
    const { data: runs, error } = await supabase.from("vyron_cost_production_runs").select("id, status").eq("company_id", companyId).in("id", runIds);
    if (error) throw new Error(`productionRuns: ${error.message}`);
    openRunIds = new Set((runs || []).filter((r: { status?: string | null }) => !FINISHED_RUN_STATUSES.has(String(r.status || ""))).map((r: { id: string }) => String(r.id)));
  }
  const openRunLineIds = (runLines || []).filter((l: { production_run_id: string }) => openRunIds.has(String(l.production_run_id))).map((l: { id: string }) => String(l.id));
  result.productionRunLines = 0;
  if (openRunLineIds.length) await run("productionRunLines", supabase.from("vyron_cost_production_run_lines").update({ line_name: name }).eq("company_id", companyId).in("id", openRunLineIds).select("id"));

  // Invoice lines matched to it on invoices still being reviewed (approved invoices are history).
  const { data: docLines, error: docLineError } = await supabase.from("vyron_document_line_items").select("id, document_id").eq("matched_entity_id", ingredientId);
  if (docLineError) throw new Error(`invoiceReviewLines: ${docLineError.message}`);
  const docIds = [...new Set((docLines || []).map((l: { document_id: string }) => String(l.document_id)))];
  let reviewDocIds = new Set<string>();
  if (docIds.length) {
    const { data: docs, error } = await supabase.from("vyron_documents").select("id, status").eq("tenant_id", companyId).in("id", docIds);
    if (error) throw new Error(`invoiceReviewDocuments: ${error.message}`);
    reviewDocIds = new Set((docs || []).filter((d: { status?: string | null }) => String(d.status || "").toLowerCase() !== "archived").map((d: { id: string }) => String(d.id)));
  }
  const reviewLineIds = (docLines || []).filter((l: { document_id: string }) => reviewDocIds.has(String(l.document_id))).map((l: { id: string }) => String(l.id));
  result.invoiceReviewLines = 0;
  if (reviewLineIds.length) await run("invoiceReviewLines", supabase.from("vyron_document_line_items").update({ matched_entity_name: name }).in("id", reviewLineIds).select("id"));

  return result;
}
