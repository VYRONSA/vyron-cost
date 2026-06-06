import { supabase } from "@/lib/supabase";
import {
  calculateGpPercent,
  calculateSuggestedPrice,
  getProductRecipeLinks,
  getProducts,
  getRecipeItems,
  getRecipes,
  Product,
  ProductRecipeLink,
  Recipe,
} from "@/lib/vyron-cost-data";
import { getHandcraftedProducts, getHandcraftedRecipes, isHandcraftedDataReady } from "@/lib/handcrafted-tenant";
import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";

export type ProductBomSummary = {
  product: Product;
  linkedRecipe: Recipe | null;
  link: ProductRecipeLink | null;
  bomCost: number;
  calculatedGp: number;
  suggestedSellingPrice: number;
  marginStatus: string;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function synthesizeLink(product: Product, recipes: Recipe[]): ProductRecipeLink | null {
  const productNorm = normalizeName(product.product_name);
  const recipe =
    recipes.find((r) => normalizeName(r.recipe_name) === productNorm) ||
    recipes.find((r) => productNorm.includes(normalizeName(r.recipe_name)) || normalizeName(r.recipe_name).includes(productNorm));
  if (!recipe) return null;
  return {
    id: `link-${product.id}-${recipe.id}`,
    product_id: product.id,
    recipe_id: recipe.id,
    recipe_name_snapshot: recipe.recipe_name,
    portion_qty: 1,
    portion_cost: Number(recipe.total_cost || 0),
  };
}

export async function getLinkedRecipeForProduct(productId: string): Promise<ProductBomSummary | null> {
  const [products, recipes, links, items] = await Promise.all([
    getProducts(500),
    getRecipes(500),
    getProductRecipeLinks(500),
    getRecipeItems(2000),
  ]);

  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  let link = links.find((l) => l.product_id === productId) || null;
  if (!link) link = synthesizeLink(product, recipes);

  const linkedRecipe = link?.recipe_id
    ? recipes.find((r) => r.id === link!.recipe_id) || null
    : recipes.find((r) => normalizeName(r.recipe_name) === normalizeName(product.product_name)) || null;

  const recipeItems = linkedRecipe
    ? items.filter((item) => item.recipe_id === linkedRecipe.id)
    : [];
  const itemsTotal = recipeItems.reduce((sum, item) => sum + Number(item.line_cost || 0), 0);
  const bomCost = linkedRecipe
    ? Number(linkedRecipe.total_cost || itemsTotal || product.total_cost || 0)
    : Number(product.total_cost || 0);

  const selling = Number(product.selling_price || 0);
  const targetGp = Number(product.target_gp || 40);
  const calculatedGp = calculateGpPercent(selling, bomCost);
  const suggestedSellingPrice = calculateSuggestedPrice(bomCost, targetGp);
  const marginStatus =
    calculatedGp >= targetGp ? "Healthy" : calculatedGp >= targetGp - 8 ? "Review" : "Critical";

  return {
    product,
    linkedRecipe,
    link,
    bomCost,
    calculatedGp,
    suggestedSellingPrice,
    marginStatus,
  };
}

export async function linkProductToRecipe(productId: string, recipeId: string, companyId: string) {
  const [products, recipes] = await Promise.all([getProducts(500), getRecipes(500)]);
  const product = products.find((p) => p.id === productId);
  const recipe = recipes.find((r) => r.id === recipeId);
  if (!product || !recipe) return null;

  const payload = {
    company_id: companyId,
    product_id: productId,
    recipe_id: recipeId,
    recipe_name_snapshot: recipe.recipe_name,
    portion_qty: 1,
    portion_cost: Number(recipe.total_cost || 0),
  };

  if (supabase && companyId !== "demo-company") {
    await supabase.from("vyron_cost_product_recipe_links").upsert(payload, { onConflict: "product_id,recipe_id" });
    await supabase
      .from("vyron_cost_products")
      .update({ total_cost: Number(recipe.total_cost || product.total_cost) })
      .eq("id", productId);
  }

  return payload as ProductRecipeLink;
}

export async function getFinishedProductsWithBom() {
  const products = isHandcraftedDataReady() ? getHandcraftedProducts() : await getProducts(500);
  const recipes = isHandcraftedDataReady() ? getHandcraftedRecipes() : await getRecipes(500);
  return products.map((product) => ({
    product,
    link: synthesizeLink(product, recipes),
  }));
}

export { HANDCRAFTED_COMPANY_ID };
