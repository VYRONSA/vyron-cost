import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateMovementPercent,
  CostIngredient,
  formatMoney,
  getIngredientById,
} from "@/lib/vyron-cost-core-data";
import { calcGp, calcLineCost, calcSuggestedPrice } from "@/lib/vyron-cost-bom-data";
import { recalculateBomCosts } from "@/lib/vyron-cost-recipes-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type IngredientUsageLine = {
  line_id: string;
  bom_id: string;
  bom_name: string;
  product_id?: string | null;
  product_name?: string | null;
  line_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  wastage_percent: number;
  line_cost: number;
};

export type AffectedProduct = {
  id: string;
  product_name: string;
  selling_price: number;
  current_cost: number;
  current_gp: number;
  target_gp: number;
  suggested_selling_price: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isGeneratedColumnWriteError(error: unknown) {
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  const code = String((error as { code?: string } | null)?.code || "");
  return code === "428C9" || message.includes("can only be updated to default");
}

export async function getIngredientIntelligence(id: string): Promise<{
  ingredient: CostIngredient | null;
  usage: IngredientUsageLine[];
  products: AffectedProduct[];
  movement: number;
  estimatedRisk: number;
}> {
  const ingredient = await getIngredientById(id);

  if (!ingredient) {
    return {
      ingredient: null,
      usage: [],
      products: [],
      movement: 0,
      estimatedRisk: 0,
    };
  }

  const movement = calculateMovementPercent(
    Number(ingredient.previous_cost || 0),
    Number(ingredient.purchase_cost || 0)
  );

  const { useDemo, companyId } = await workspaceScope();

  if (useDemo && id.startsWith("demo")) {
    const usage: IngredientUsageLine[] = [
      {
        line_id: "demo-line-1",
        bom_id: "demo-pepper-steak-bom",
        bom_name: "Pepper Steak Pie BOM",
        product_id: "demo-pepper-steak-pie",
        product_name: "Pepper Steak Pie",
        line_name: ingredient.ingredient_name,
        quantity: 0.12,
        unit: "kg",
        unit_cost: Number(ingredient.true_unit_cost || ingredient.purchase_cost || 0),
        wastage_percent: Number(ingredient.yield_percent || 0) < 100 ? 5 : 0,
        line_cost: 12.55,
      },
    ];

    return {
      ingredient,
      usage,
      products: [
        {
          id: "demo-pepper-steak-pie",
          product_name: "Pepper Steak Pie",
          selling_price: 45,
          current_cost: 14,
          current_gp: 68.9,
          target_gp: 65,
          suggested_selling_price: 40,
        },
      ],
      movement,
      estimatedRisk: Math.max(0, movement) * 1200,
    };
  }

  const { supabase } = await import("@/lib/supabase");
  if (!supabase || !companyId) {
    return {
      ingredient,
      usage: [],
      products: [],
      movement,
      estimatedRisk: Math.max(0, movement) * 1200,
    };
  }

  const { data: lines, error: linesError } = await supabase
    .from("vyron_cost_bom_lines")
    .select("id, bom_id, line_name, quantity, unit, unit_cost, wastage_percent, line_cost")
    .eq("company_id", companyId)
    .eq("ingredient_id", id)
    .limit(500);

  if (linesError || !lines || lines.length === 0) {
    return {
      ingredient,
      usage: [],
      products: [],
      movement,
      estimatedRisk: Math.max(0, movement) * 1200,
    };
  }

  const bomIds = Array.from(new Set(lines.map((line) => String(line.bom_id))));

  const { data: boms } = await supabase
    .from("vyron_cost_boms")
    .select("id, bom_name, cost_per_unit")
    .eq("company_id", companyId)
    .in("id", bomIds);

  const { data: products } = await supabase
    .from("vyron_cost_products")
    .select(
      "id, product_name, linked_bom_id, selling_price, total_cost, target_gp, calculated_gp, suggested_selling_price"
    )
    .eq("company_id", companyId)
    .in("linked_bom_id", bomIds);

  const usage: IngredientUsageLine[] = lines.map((line) => {
    const bom = (boms || []).find((item) => item.id === line.bom_id);
    const product = (products || []).find((item) => item.linked_bom_id === line.bom_id);

    return {
      line_id: String(line.id),
      bom_id: String(line.bom_id),
      bom_name: String(bom?.bom_name || "BOM"),
      product_id: product?.id || null,
      product_name: product?.product_name || null,
      line_name: String(line.line_name || ingredient.ingredient_name),
      quantity: Number(line.quantity || 0),
      unit: String(line.unit || ""),
      unit_cost: Number(line.unit_cost || 0),
      wastage_percent: Number(line.wastage_percent || 0),
      line_cost: Number(line.line_cost || 0),
    };
  });

  const affectedProducts: AffectedProduct[] = (products || []).map((product) => ({
    id: String(product.id),
    product_name: String(product.product_name || "Product"),
    selling_price: Number(product.selling_price || 0),
    current_cost: Number(product.total_cost || 0),
    current_gp: Number(
      product.calculated_gp ||
        calcGp(Number(product.selling_price || 0), Number(product.total_cost || 0))
    ),
    target_gp: Number(product.target_gp || 40),
    suggested_selling_price: Number(
      product.suggested_selling_price ||
        calcSuggestedPrice(Number(product.total_cost || 0), Number(product.target_gp || 40))
    ),
  }));

  const estimatedRisk = usage.reduce((sum, line) => {
    const increasePerLine =
      Number(ingredient.previous_cost || 0) > 0 ? line.line_cost * (movement / 100) : 0;
    return sum + Math.max(0, increasePerLine * 100);
  }, 0);

  return {
    ingredient,
    usage,
    products: affectedProducts,
    movement,
    estimatedRisk,
  };
}

export async function recalculateBomsUsingIngredient(
  supabase: SupabaseClient,
  companyId: string,
  ingredientId: string
): Promise<{
  bomCount: number;
  productCount: number;
}> {
  const { data: ingredient, error: ingredientError } = await supabase
    .from("vyron_cost_ingredients")
    .select("true_unit_cost, purchase_cost")
    .eq("id", ingredientId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (ingredientError) throw new Error(ingredientError.message);
  if (!ingredient) return { bomCount: 0, productCount: 0 };

  const newUnitCost = Number(ingredient.true_unit_cost || ingredient.purchase_cost || 0);

  const { data: lines, error: linesError } = await supabase
    .from("vyron_cost_bom_lines")
    .select("id, bom_id, quantity, wastage_percent")
    .eq("company_id", companyId)
    .eq("ingredient_id", ingredientId);

  if (linesError) throw new Error(linesError.message);
  if (!lines || lines.length === 0) return { bomCount: 0, productCount: 0 };

  for (const line of lines) {
    const lineCost = round2(
      calcLineCost({
        quantity: Number(line.quantity || 0),
        unit_cost: newUnitCost,
        wastage_percent: Number(line.wastage_percent || 0),
      })
    );

    let updateLineResult = await supabase
      .from("vyron_cost_bom_lines")
      .update({ unit_cost: newUnitCost, line_cost: lineCost })
      .eq("id", line.id)
      .eq("company_id", companyId);

    if (updateLineResult.error && isGeneratedColumnWriteError(updateLineResult.error)) {
      updateLineResult = await supabase
        .from("vyron_cost_bom_lines")
        .update({ unit_cost: newUnitCost })
        .eq("id", line.id)
        .eq("company_id", companyId);
    }

    if (updateLineResult.error) throw new Error(updateLineResult.error.message);
  }

  const bomIds = Array.from(new Set(lines.map((line) => String(line.bom_id))));
  let productCount = 0;

  for (const bomId of bomIds) {
    const result = await recalculateBomCosts(supabase, companyId, bomId);
    productCount += result.productCount;
  }

  return { bomCount: bomIds.length, productCount };
}
