/**
 * VYRON — reads one tenant's current state for the Food Sock planner.
 *
 * SELECT only, and every query is filtered by company_id, so a snapshot never
 * contains another tenant's rows. The CLI's dry run, its --validate and the
 * regression tests all read the tenant through this one function.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyTarget, type TargetSnapshot } from "@/lib/data-migration/food-sock-plan";

export async function readFoodSockTarget(
  supabase: SupabaseClient,
  companyId: string,
  onNotice: (message: string) => void = () => {}
): Promise<TargetSnapshot> {
  const select = async (table: string, columns: string) => {
    const { data, error } = await supabase.from(table).select(columns).eq("company_id", companyId);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data || []) as unknown as Record<string, unknown>[];
  };
  const target = emptyTarget(companyId);
  target.suppliers = (await select("vyron_cost_suppliers", "id, supplier_name")) as TargetSnapshot["suppliers"];
  target.ingredients = (await select("vyron_cost_ingredients", "id, ingredient_name")) as TargetSnapshot["ingredients"];
  target.products = (await select("vyron_cost_products", "id, product_name, sku")) as TargetSnapshot["products"];
  target.boms = (await select("vyron_cost_boms", "id, bom_name, product_id")) as TargetSnapshot["boms"];
  target.stockItems = (await select("vyron_cost_stock_items", "id, item_code, entity_type, entity_id")) as TargetSnapshot["stockItems"];
  target.categories = (await select("vyron_cost_categories", "id, category_name, category_type")) as TargetSnapshot["categories"];
  const ledger = await select("vyron_cost_stock_ledger", "stock_item_id, movement_type");
  target.openingBalanceStockItemIds = [...new Set(ledger.filter((r) => r.movement_type === "Opening Balance").map((r) => String(r.stock_item_id)))];
  try {
    target.sourceLinks = (await select("vyron_import_source_links", "source_system, source_entity, source_key, entity_type, entity_id")) as TargetSnapshot["sourceLinks"];
  } catch (error) {
    onNotice(`source links unavailable: ${error instanceof Error ? error.message : String(error)} — treated as none`);
  }
  return target;
}
