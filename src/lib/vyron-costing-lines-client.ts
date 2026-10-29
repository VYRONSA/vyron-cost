import type { RecipeItem } from "@/lib/vyron-cost-data";

export const COSTING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cost Calculator lines are written by the server (/api/cost-calculator/lines),
 * which checks boms.edit and the member's company and takes the ingredient's
 * name, unit and unit cost from the ingredient record. The screens send only
 * the recipe, the ingredient and the quantity.
 */
export async function sendCostingLine(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: { recipe_id: string; ingredient_id: string; quantity: number }
): Promise<{ item: RecipeItem | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return { item: null, error: json.error || "The change could not be saved." };
    return { item: (json.item as RecipeItem) || null, error: null };
  } catch {
    return { item: null, error: "The change could not be saved." };
  }
}
