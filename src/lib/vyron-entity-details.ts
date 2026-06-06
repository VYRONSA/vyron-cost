import { supabase } from "@/lib/supabase";
import {
  getHandcraftedIngredients,
  getHandcraftedProductCostLines,
  getHandcraftedProducts,
  getHandcraftedRecipeItems,
  getHandcraftedRecipes,
  isHandcraftedDataReady,
} from "@/lib/handcrafted-tenant";
import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";
import type { Ingredient, Product, ProductCostLine, Recipe, RecipeItem, Supplier } from "@/lib/vyron-cost-data";
import {
  demoIngredientRows,
  demoProductRows,
  demoRecipeRows,
  demoSupplierRows,
  formatMoney,
} from "@/lib/vyron-cost-ui-adapters";

export type DetailLine = {
  id: string;
  name: string;
  lineType: string;
  quantity: number;
  unit: string;
  unitCost: number;
  lineCost: number;
  href?: string;
};

export type ProductDetail = {
  product: Product;
  lines: ProductCostLine[];
  grouped: Record<string, ProductCostLine[]>;
};

export type RecipeDetail = {
  recipe: Recipe;
  items: RecipeItem[];
};

export type IngredientDetail = {
  ingredient: Ingredient;
  supplierName: string | null;
  linkedProducts: { id: string; name: string; lineCost: number }[];
};

export type SupplierDetail = {
  supplier: Supplier;
  linkedIngredients: Ingredient[];
  linkedProducts: { id: string; name: string; category: string }[];
};

export type AlertRow = {
  id: string;
  title: string;
  severity: string;
  impact: string;
  status: string;
  href: string;
};

export function detailHref(
  type: "products" | "recipes" | "ingredients" | "suppliers",
  id: string
) {
  const routes = {
    products: `/products/${id}`,
    recipes: `/recipes/${id}`,
    ingredients: `/ingredients/${id}`,
    suppliers: `/suppliers/${id}`,
  };
  return routes[type];
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : undefined,
    product_name: String(row.product_name || ""),
    category: String(row.category || "General"),
    status: row.status ? String(row.status) : "Active",
    selling_price: Number(row.selling_price || 0),
    total_cost: Number(row.total_cost || 0),
    target_gp: Number(row.target_gp || 40),
    salary_cost: Number(row.salary_cost || 0),
    packaging_cost: Number(row.packaging_cost || 0),
    overhead_cost: Number(row.overhead_cost || 0),
    wastage_percent: Number(row.wastage_percent || 0),
    extracted_line_count: Number(row.extracted_line_count || 0),
  };
}

function mapRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : undefined,
    recipe_name: String(row.recipe_name || ""),
    recipe_type: String(row.recipe_type || "Recipe"),
    category: row.category ? String(row.category) : undefined,
    yield_qty: Number(row.yield_qty || 1),
    total_cost: Number(row.total_cost || 0),
    selling_price: Number(row.selling_price || 0),
    target_gp: Number(row.target_gp || 40),
    status: String(row.status || "Active"),
    version_note: row.version_note ? String(row.version_note) : null,
  };
}

function mapIngredient(row: Record<string, unknown>): Ingredient {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : undefined,
    ingredient_name: String(row.ingredient_name || ""),
    category: String(row.category || "General"),
    purchase_unit: String(row.purchase_unit || "unit"),
    recipe_unit: String(row.recipe_unit || "unit"),
    purchase_cost: Number(row.purchase_cost || 0),
    previous_cost: Number(row.previous_cost || row.purchase_cost || 0),
    yield_type: String(row.yield_type || "standard"),
    yield_percent: Number(row.yield_percent || 100),
    true_unit_cost: Number(row.true_unit_cost || row.purchase_cost || 0),
    current_alert: row.current_alert ? String(row.current_alert) : null,
  };
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : undefined,
    supplier_name: String(row.supplier_name || ""),
    category: String(row.category || "General"),
    contact_email: row.contact_email ? String(row.contact_email) : null,
    invoice_email: row.invoice_email ? String(row.invoice_email) : null,
    risk_status: String(row.risk_status || "Stable"),
    last_price_movement: Number(row.last_price_movement || 0),
  };
}

function mapCostLine(row: Record<string, unknown>): ProductCostLine {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : undefined,
    product_id: row.product_id ? String(row.product_id) : null,
    product_name: row.product_name ? String(row.product_name) : null,
    line_type: String(row.line_type || "Ingredient"),
    line_name: String(row.line_name || ""),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || "unit"),
    unit_cost: Number(row.unit_cost || 0),
    wastage_percent: Number(row.wastage_percent || 0),
    line_cost: Number(row.line_cost || row.line_cost_imported || 0),
    line_cost_imported: Number(row.line_cost_imported || row.line_cost || 0),
    source_sheet: row.source_sheet ? String(row.source_sheet) : null,
    source_row: row.source_row != null ? Number(row.source_row) : null,
    raw_row: row.raw_row ? String(row.raw_row) : null,
  };
}

function mapRecipeItem(row: Record<string, unknown>): RecipeItem {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : undefined,
    recipe_id: row.recipe_id ? String(row.recipe_id) : undefined,
    ingredient_id: row.ingredient_id ? String(row.ingredient_id) : null,
    ingredient_name_snapshot: String(row.ingredient_name_snapshot || ""),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || "unit"),
    true_unit_cost: Number(row.true_unit_cost || 0),
    line_cost: Number(row.line_cost || 0),
  };
}

function groupCostLines(lines: ProductCostLine[]) {
  return lines.reduce<Record<string, ProductCostLine[]>>((acc, line) => {
    const key = String(line.line_type || "Other");
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});
}

function demoProductById(id: string): Product | null {
  const row = demoProductRows.find((r) => r.id === id);
  if (!row) return null;
  const selling = Number(row.impact.replace(/[^\d-]/g, "")) + 100;
  return {
    id: row.id,
    product_name: row.name,
    category: row.category || "Product",
    selling_price: selling,
    total_cost: Math.max(selling * 0.55, 10),
    target_gp: 40,
  };
}

function demoRecipeById(id: string): Recipe | null {
  const row = demoRecipeRows.find((r) => r.id === id);
  if (!row) return null;
  return {
    id: row.id,
    recipe_name: row.name,
    recipe_type: row.category || "Recipe",
    category: row.category,
    yield_qty: 1,
    total_cost: Number(row.metric.replace(/[^\d.]/g, "")) || 12,
    status: row.status,
  };
}

function demoIngredientById(id: string): Ingredient | null {
  const row = demoIngredientRows.find((r) => r.id === id);
  if (!row) return null;
  return {
    id: row.id,
    ingredient_name: row.name,
    category: row.category || "Ingredient",
    purchase_unit: "kg",
    recipe_unit: "kg",
    purchase_cost: Number(row.metric.replace(/[^\d.]/g, "")) || 0,
    previous_cost: Number(row.metric.replace(/[^\d.]/g, "")) || 0,
    yield_type: "standard",
    yield_percent: 100,
    true_unit_cost: Number(row.metric.replace(/[^\d.]/g, "")) || 0,
    current_alert: row.status === "Review" ? row.impact : null,
  };
}

function demoSupplierById(id: string): Supplier | null {
  const row = demoSupplierRows.find((r) => r.id === id);
  if (!row) return null;
  return {
    id: row.id,
    supplier_name: row.name,
    category: row.category || "Supplier",
    contact_email: null,
    invoice_email: null,
    risk_status: row.status,
    last_price_movement: Number(row.metric.replace(/[^\d.]/g, "")) || 0,
  };
}

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  if (supabase) {
    const productRes = await supabase.from("vyron_cost_products").select("*").eq("id", id).maybeSingle();
    if (productRes.data) {
      const product = mapProduct(productRes.data as Record<string, unknown>);
      const linesRes = await supabase
        .from("vyron_cost_product_cost_lines")
        .select("*")
        .eq("product_id", id)
        .order("line_type", { ascending: true })
        .limit(200);
      const lines = (linesRes.data || []).map((r) => mapCostLine(r as Record<string, unknown>));
      return { product, lines, grouped: groupCostLines(lines) };
    }
  }

  if (isHandcraftedDataReady()) {
    const product = getHandcraftedProducts().find((p) => p.id === id);
    if (product) {
      const lines = getHandcraftedProductCostLines().filter(
        (l) => l.product_id === id || l.product_name === product.product_name
      );
      return { product, lines, grouped: groupCostLines(lines) };
    }
  }

  const demo = demoProductById(id);
  if (demo) return { product: demo, lines: [], grouped: {} };
  return null;
}

export async function getRecipeDetail(id: string): Promise<RecipeDetail | null> {
  if (supabase) {
    const recipeRes = await supabase.from("vyron_cost_recipes").select("*").eq("id", id).maybeSingle();
    if (recipeRes.data) {
      const recipe = mapRecipe(recipeRes.data as Record<string, unknown>);
      const itemsRes = await supabase
        .from("vyron_cost_recipe_items")
        .select("*")
        .eq("recipe_id", id)
        .order("ingredient_name_snapshot", { ascending: true })
        .limit(200);
      let items = (itemsRes.data || []).map((r) => mapRecipeItem(r as Record<string, unknown>));
      if (!items.length) {
        items = synthesizeRecipeItemsFromCostLines(recipe);
      }
      return { recipe, items };
    }
  }

  if (isHandcraftedDataReady()) {
    const recipe = getHandcraftedRecipes().find((r) => r.id === id);
    if (recipe) {
      let items = getHandcraftedRecipeItems().filter((i) => i.recipe_id === id);
      if (!items.length) items = synthesizeRecipeItemsFromCostLines(recipe);
      return { recipe, items };
    }
  }

  const demo = demoRecipeById(id);
  if (demo) {
    return {
      recipe: demo,
      items: [
        {
          id: `${demo.id}-item-1`,
          ingredient_name_snapshot: "Flour",
          quantity: 1,
          unit: "kg",
          true_unit_cost: 18,
          line_cost: 18,
        },
        {
          id: `${demo.id}-item-2`,
          ingredient_name_snapshot: "Beef",
          quantity: 0.5,
          unit: "kg",
          true_unit_cost: 92,
          line_cost: 46,
        },
      ],
    };
  }

  return null;
}

function synthesizeRecipeItemsFromCostLines(recipe: Recipe): RecipeItem[] {
  const recipeName = recipe.recipe_name.toLowerCase();
  const lines = isHandcraftedDataReady() ? getHandcraftedProductCostLines() : [];
  const matches = lines.filter((line) => {
    const productName = String(line.product_name || "").toLowerCase();
    return productName.includes(recipeName.split(" ")[0]) || recipeName.includes(productName.split(" ")[0]);
  });

  return matches.slice(0, 12).map((line, index) => ({
    id: `synthetic-${recipe.id}-${index}`,
    recipe_id: recipe.id,
    ingredient_name_snapshot: line.line_name,
    quantity: Number(line.quantity || 0),
    unit: line.unit,
    true_unit_cost: Number(line.unit_cost || 0),
    line_cost: Number(line.line_cost || line.line_cost_imported || 0),
  }));
}

export async function getIngredientDetail(id: string): Promise<IngredientDetail | null> {
  let ingredient: Ingredient | null = null;
  let suppliers: Supplier[] = [];

  if (supabase) {
    const ingRes = await supabase.from("vyron_cost_ingredients").select("*").eq("id", id).maybeSingle();
    if (ingRes.data) ingredient = mapIngredient(ingRes.data as Record<string, unknown>);
    const supRes = await supabase
      .from("vyron_cost_suppliers")
      .select("*")
      .eq("company_id", HANDCRAFTED_COMPANY_ID)
      .limit(200);
    suppliers = (supRes.data || []).map((r) => mapSupplier(r as Record<string, unknown>));
  }

  if (!ingredient && isHandcraftedDataReady()) {
    ingredient = getHandcraftedIngredients().find((i) => i.id === id) || null;
  }

  if (!ingredient) {
    ingredient = demoIngredientById(id);
  }

  if (!ingredient) return null;

  const supplierName =
    suppliers.find((s) => s.category === ingredient!.category)?.supplier_name ||
    `${ingredient.category} supplier`;

  const costLines = isHandcraftedDataReady() ? getHandcraftedProductCostLines() : [];
  const products = isHandcraftedDataReady() ? getHandcraftedProducts() : [];
  const needle = ingredient.ingredient_name.toLowerCase();

  const linkedProducts = products
    .filter((product) =>
      costLines.some(
        (line) =>
          (line.product_id === product.id || line.product_name === product.product_name) &&
          String(line.line_name || "").toLowerCase().includes(needle.slice(0, 4))
      )
    )
    .slice(0, 8)
    .map((product) => {
      const lineCost = costLines
        .filter(
          (line) =>
            (line.product_id === product.id || line.product_name === product.product_name) &&
            String(line.line_name || "").toLowerCase().includes(needle.slice(0, 4))
        )
        .reduce((sum, line) => sum + Number(line.line_cost || line.line_cost_imported || 0), 0);
      return { id: product.id, name: product.product_name, lineCost };
    });

  return { ingredient, supplierName, linkedProducts };
}

export async function getSupplierDetail(id: string): Promise<SupplierDetail | null> {
  let supplier: Supplier | null = null;

  if (supabase) {
    const supRes = await supabase.from("vyron_cost_suppliers").select("*").eq("id", id).maybeSingle();
    if (supRes.data) supplier = mapSupplier(supRes.data as Record<string, unknown>);
  }

  if (!supplier) supplier = demoSupplierById(id);

  if (!supplier) return null;

  let ingredients: Ingredient[] = [];
  if (supabase) {
    const ingRes = await supabase
      .from("vyron_cost_ingredients")
      .select("*")
      .eq("company_id", HANDCRAFTED_COMPANY_ID)
      .eq("category", supplier.category)
      .limit(50);
    ingredients = (ingRes.data || []).map((r) => mapIngredient(r as Record<string, unknown>));
  }
  if (!ingredients.length && isHandcraftedDataReady()) {
    ingredients = getHandcraftedIngredients().filter((i) => i.category === supplier!.category).slice(0, 50);
  }

  const products = isHandcraftedDataReady() ? getHandcraftedProducts() : [];
  const linkedProducts = products
    .filter((p) => p.category === supplier.category || /protein|packaging|meat/i.test(`${p.category} ${p.product_name}`))
    .slice(0, 8)
    .map((p) => ({ id: p.id, name: p.product_name, category: p.category }));

  return { supplier, linkedIngredients: ingredients, linkedProducts };
}

export async function getAlertRows(): Promise<AlertRow[]> {
  if (supabase) {
    const { data } = await supabase
      .from("vyron_cost_leakage_findings")
      .select("*")
      .order("estimated_monthly_loss", { ascending: false })
      .limit(12);

    if (data?.length) {
      return data.map((row: Record<string, unknown>, index) => ({
        id: String(row.id || index),
        title: String(row.title || "Financial alert"),
        severity: String(row.severity || "Medium"),
        impact: formatMoney(Number(row.estimated_monthly_loss || 0)),
        status: String(row.status || "Open"),
        href: "/financial-leakage",
      }));
    }
  }

  return [
    { id: "a1", title: "Meat supplier inflation detected", severity: "Critical", impact: "R42,800", status: "Active", href: "/supplier-inflation" },
    { id: "a2", title: "Chicken Pie margin below target", severity: "High", impact: "R15,900", status: "Open", href: "/product-profitability" },
    { id: "a3", title: "Duplicate invoice risk flagged", severity: "High", impact: "R12,268", status: "Investigate", href: "/invoice-forensics" },
    { id: "a4", title: "Packaging cost trend increasing", severity: "Medium", impact: "R8,420", status: "Review", href: "/procurement-risk" },
    { id: "a5", title: "Recoverable repricing opportunity", severity: "High", impact: "R324,000", status: "Pending", href: "/recovery-opportunities" },
  ];
}

export function gpPercent(selling: number, cost: number) {
  if (!selling || selling <= 0) return 0;
  return ((selling - cost) / selling) * 100;
}
