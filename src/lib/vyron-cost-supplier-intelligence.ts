import { supabase } from "@/lib/supabase";
import { CostSupplier, getSupplierById, formatMoney } from "@/lib/vyron-cost-core-data";
import { getIngredientIntelligence } from "@/lib/vyron-cost-ingredient-intelligence";

export type SupplierIngredientImpact = {
  ingredient_id: string;
  ingredient_name: string;
  category: string;
  purchase_cost: number;
  previous_cost: number;
  movement: number;
  true_unit_cost: number;
  bom_count: number;
  product_count: number;
  estimated_risk: number;
};

export type SupplierIntelligenceResult = {
  supplier: CostSupplier | null;
  ingredients: SupplierIngredientImpact[];
  totalEstimatedRisk: number;
  affectedBomCount: number;
  affectedProductCount: number;
  highestRiskIngredient: SupplierIngredientImpact | null;
  recommendedAction: string;
};

function movement(previousCost: number, currentCost: number) {
  if (!previousCost || previousCost <= 0) return 0;
  return ((currentCost - previousCost) / previousCost) * 100;
}

export async function getSupplierIntelligence(id: string): Promise<SupplierIntelligenceResult> {
  const supplier = await getSupplierById(id);

  if (!supplier) {
    return {
      supplier: null,
      ingredients: [],
      totalEstimatedRisk: 0,
      affectedBomCount: 0,
      affectedProductCount: 0,
      highestRiskIngredient: null,
      recommendedAction: "Supplier not found.",
    };
  }

  if (!supabase || id.startsWith("demo")) {
    const ingredients: SupplierIngredientImpact[] = [
      {
        ingredient_id: "demo-beef",
        ingredient_name: "Beef",
        category: "Protein",
        purchase_cost: 92,
        previous_cost: 84,
        movement: 9.52,
        true_unit_cost: 104.55,
        bom_count: 3,
        product_count: 5,
        estimated_risk: 42000,
      },
      {
        ingredient_id: "demo-pastry-margarine",
        ingredient_name: "Pastry Margarine",
        category: "Dairy / Fats",
        purchase_cost: 46,
        previous_cost: 42,
        movement: 9.52,
        true_unit_cost: 46,
        bom_count: 2,
        product_count: 4,
        estimated_risk: 18500,
      },
    ];

    return {
      supplier,
      ingredients,
      totalEstimatedRisk: 60500,
      affectedBomCount: 5,
      affectedProductCount: 9,
      highestRiskIngredient: ingredients[0],
      recommendedAction: "Review supplier pricing and negotiate affected high-volume ingredients.",
    };
  }

  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("id, ingredient_name, category, purchase_cost, previous_cost, true_unit_cost")
    .eq("supplier_id", id)
    .order("ingredient_name", { ascending: true });

  if (error || !data || data.length === 0) {
    return {
      supplier,
      ingredients: [],
      totalEstimatedRisk: 0,
      affectedBomCount: 0,
      affectedProductCount: 0,
      highestRiskIngredient: null,
      recommendedAction: "No linked ingredients yet. Link ingredients to this supplier to unlock intelligence.",
    };
  }

  const impacts: SupplierIngredientImpact[] = [];

  for (const item of data as any[]) {
    const intel = await getIngredientIntelligence(String(item.id));
    const mov = movement(Number(item.previous_cost || 0), Number(item.purchase_cost || 0));

    impacts.push({
      ingredient_id: String(item.id),
      ingredient_name: String(item.ingredient_name || "Ingredient"),
      category: String(item.category || "Uncategorised"),
      purchase_cost: Number(item.purchase_cost || 0),
      previous_cost: Number(item.previous_cost || 0),
      movement: mov,
      true_unit_cost: Number(item.true_unit_cost || item.purchase_cost || 0),
      bom_count: intel.usage.length,
      product_count: intel.products.length,
      estimated_risk: intel.estimatedRisk,
    });
  }

  const totalEstimatedRisk = impacts.reduce((sum, item) => sum + item.estimated_risk, 0);
  const affectedBomCount = impacts.reduce((sum, item) => sum + item.bom_count, 0);
  const affectedProductCount = impacts.reduce((sum, item) => sum + item.product_count, 0);
  const highestRiskIngredient = impacts
    .slice()
    .sort((a, b) => b.estimated_risk - a.estimated_risk)[0] || null;

  let recommendedAction = "Monitor supplier pricing.";
  if (totalEstimatedRisk > 50000) {
    recommendedAction = "High risk: negotiate pricing or source alternate supplier.";
  } else if (totalEstimatedRisk > 15000) {
    recommendedAction = "Medium risk: review price movement and affected products.";
  }

  return {
    supplier,
    ingredients: impacts,
    totalEstimatedRisk,
    affectedBomCount,
    affectedProductCount,
    highestRiskIngredient,
    recommendedAction,
  };
}

export { formatMoney };
