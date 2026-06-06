import { supabase } from "@/lib/supabase";
import {
  calculateMovementPercent,
  CostIngredient,
  demoIngredients,
  formatMoney,
  getIngredientById,
} from "@/lib/vyron-cost-core-data";
import { calcGp, calcSuggestedPrice } from "@/lib/vyron-cost-bom-data";

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

  if (!supabase || id.startsWith("demo")) {
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

  const { data: lines, error: linesError } = await supabase
    .from("vyron_cost_bom_lines")
    .select("id, bom_id, line_name, quantity, unit, unit_cost, wastage_percent, line_cost")
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

  const bomIds = Array.from(new Set(lines.map((line: any) => String(line.bom_id))));

  const { data: boms } = await supabase
    .from("vyron_cost_boms")
    .select("id, bom_name, cost_per_unit")
    .in("id", bomIds);

  const { data: products } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, linked_bom_id, selling_price, total_cost, target_gp, calculated_gp, suggested_selling_price")
    .in("linked_bom_id", bomIds);

  const usage: IngredientUsageLine[] = lines.map((line: any) => {
    const bom = (boms || []).find((item: any) => item.id === line.bom_id);
    const product = (products || []).find((item: any) => item.linked_bom_id === line.bom_id);

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

  const affectedProducts: AffectedProduct[] = (products || []).map((product: any) => ({
    id: String(product.id),
    product_name: String(product.product_name || "Product"),
    selling_price: Number(product.selling_price || 0),
    current_cost: Number(product.total_cost || 0),
    current_gp: Number(product.calculated_gp || calcGp(Number(product.selling_price || 0), Number(product.total_cost || 0))),
    target_gp: Number(product.target_gp || 40),
    suggested_selling_price: Number(product.suggested_selling_price || calcSuggestedPrice(Number(product.total_cost || 0), Number(product.target_gp || 40))),
  }));

  const estimatedRisk = usage.reduce((sum, line) => {
    const increasePerLine = Number(ingredient.previous_cost || 0) > 0
      ? line.line_cost * (movement / 100)
      : 0;
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

export async function recalculateBomsUsingIngredient(ingredientId: string): Promise<{
  bomCount: number;
  productCount: number;
}> {
  if (!supabase) return { bomCount: 0, productCount: 0 };

  const ingredient = await getIngredientById(ingredientId);
  if (!ingredient) return { bomCount: 0, productCount: 0 };

  const newUnitCost = Number(ingredient.true_unit_cost || ingredient.purchase_cost || 0);

  const { data: lines, error: linesError } = await supabase
    .from("vyron_cost_bom_lines")
    .select("id, bom_id")
    .eq("ingredient_id", ingredientId);

  if (linesError) throw linesError;
  if (!lines || lines.length === 0) return { bomCount: 0, productCount: 0 };

  const bomIds = Array.from(new Set(lines.map((line: any) => String(line.bom_id))));

  const { error: updateLinesError } = await supabase
    .from("vyron_cost_bom_lines")
    .update({ unit_cost: newUnitCost })
    .eq("ingredient_id", ingredientId);

  if (updateLinesError) throw updateLinesError;

  let productCount = 0;

  for (const bomId of bomIds) {
    const { data: bomLines, error: bomLinesError } = await supabase
      .from("vyron_cost_bom_lines")
      .select("quantity, unit_cost, wastage_percent, line_cost")
      .eq("bom_id", bomId);

    if (bomLinesError) throw bomLinesError;

    const totalCost = (bomLines || []).reduce(
      (sum: number, line: any) => sum + Number(line.line_cost || 0),
      0
    );

    const { data: bom, error: bomError } = await supabase
      .from("vyron_cost_boms")
      .select("yield_qty, target_gp, selling_price")
      .eq("id", bomId)
      .maybeSingle();

    if (bomError) throw bomError;

    const yieldQty = Number(bom?.yield_qty || 1);
    const costPerUnit = yieldQty > 0 ? totalCost / yieldQty : totalCost;
    const bomGp = calcGp(Number(bom?.selling_price || 0), costPerUnit);
    const bomSuggestedPrice = calcSuggestedPrice(costPerUnit, Number(bom?.target_gp || 40));

    const { error: updateBomError } = await supabase
      .from("vyron_cost_boms")
      .update({
        total_cost: totalCost,
        cost_per_unit: costPerUnit,
        calculated_gp: bomGp,
        suggested_selling_price: bomSuggestedPrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bomId);

    if (updateBomError) throw updateBomError;

    const { data: linkedProducts, error: productError } = await supabase
      .from("vyron_cost_products")
      .select("id, selling_price, target_gp")
      .eq("linked_bom_id", bomId);

    if (productError) throw productError;

    for (const product of linkedProducts || []) {
      const productGp = calcGp(Number(product.selling_price || 0), costPerUnit);
      const suggestedPrice = calcSuggestedPrice(costPerUnit, Number(product.target_gp || 40));

      const { error: updateProductError } = await supabase
        .from("vyron_cost_products")
        .update({
          total_cost: costPerUnit,
          calculated_gp: productGp,
          suggested_selling_price: suggestedPrice,
        })
        .eq("id", product.id);

      if (updateProductError) throw updateProductError;
      productCount++;
    }
  }

  return { bomCount: bomIds.length, productCount };
}
