import { supabase } from "@/lib/supabase";

export type DashboardProductCard = {
  id: string;
  name: string;
  category: string;
  gp: number;
  sellingPrice: number;
  totalCost: number;
  emoji: string;
  tone: "green" | "blue" | "amber" | "red";
  badge: string;
};

export type SimpleRow = {
  id: string;
  name: string;
  metric: string;
  status: string;
  impact: string;
  category?: string;
};

const handcraftedDemoKeywords = [
  "pie",
  "pastry",
  "sausage",
  "boerewors",
  "steak",
  "kidney",
  "pepper",
  "chicken",
  "mushroom",
  "peri",
  "spinach",
  "feta",
  "curry",
  "veg",
  "mince",
  "crown",
  "gourmet",
  "puff",
];

function isHandcraftedDemoProduct(name: string, category = "") {
  const value = `${name} ${category}`.toLowerCase();

  if (
    value.includes("sushi") ||
    value.includes("sashimi") ||
    value.includes("nigiri") ||
    value.includes("maki") ||
    value.includes("roll reloaded") ||
    value.includes("combo") ||
    value.includes("sandwich")
  ) {
    return false;
  }

  return handcraftedDemoKeywords.some((keyword) => value.includes(keyword));
}

function gpFromProduct(sellingPrice: number, totalCost: number, fallback = 0) {
  if (!sellingPrice || sellingPrice <= 0) return fallback;
  return ((sellingPrice - totalCost) / sellingPrice) * 100;
}

function toneFromGp(gp: number): DashboardProductCard["tone"] {
  if (gp >= 70) return "green";
  if (gp >= 50) return "blue";
  if (gp >= 35) return "amber";
  return "red";
}

function badgeFromGp(gp: number) {
  if (gp >= 70) return "Best Seller";
  if (gp >= 50) return "Good Performer";
  if (gp >= 35) return "Review Margin";
  return "Under Target";
}

export function emojiForProduct(name: string, category = "") {
  const value = `${name} ${category}`.toLowerCase();

  if (value.includes("sausage") || value.includes("boerewors")) return "🌭";
  if (value.includes("chicken")) return "🥧";
  if (value.includes("steak") || value.includes("kidney") || value.includes("pepper")) return "🥧";
  if (value.includes("pastry") || value.includes("puff")) return "🥐";
  if (value.includes("spinach") || value.includes("feta") || value.includes("veg")) return "🥧";
  if (value.includes("pie") || value.includes("gourmet") || value.includes("crown")) return "🥧";

  return "🥧";
}

export function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function cleanProductName(name: string) {
  return name
    .replace(/Imported From Excel/gi, "")
    .replace(/Handcrafted Costing/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getDashboardProducts(limit = 5): Promise<DashboardProductCard[]> {
  if (!supabase) return demoDashboardProducts;

  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, category, selling_price, total_cost, target_gp")
    .order("product_name", { ascending: true })
    .limit(500);

  if (error || !data || data.length === 0) return demoDashboardProducts;

  const filtered = data
    .filter((item: any) => isHandcraftedDemoProduct(String(item.product_name || ""), String(item.category || "")))
    .slice(0, limit);

  const source = filtered.length ? filtered : data.slice(0, limit);

  return source.map((item: any) => {
    const sellingPrice = Number(item.selling_price || 0);
    const totalCost = Number(item.total_cost || 0);
    const gp = gpFromProduct(sellingPrice, totalCost, Number(item.target_gp || 0) || 45);
    const name = cleanProductName(String(item.product_name || "Product"));
    const category = String(item.category || "Handcrafted Product");

    return {
      id: String(item.id),
      name,
      category,
      gp: Math.round(gp),
      sellingPrice,
      totalCost,
      emoji: emojiForProduct(name, category),
      tone: toneFromGp(gp),
      badge: badgeFromGp(gp),
    };
  });
}

export async function getProductRows(limit = 120): Promise<SimpleRow[]> {
  if (!supabase) return demoProductRows;

  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name, category, selling_price, total_cost, target_gp")
    .order("product_name", { ascending: true })
    .limit(1000);

  if (error || !data || data.length === 0) return demoProductRows;

  const filtered = data
    .filter((item: any) => isHandcraftedDemoProduct(String(item.product_name || ""), String(item.category || "")))
    .slice(0, limit);

  const source = filtered.length ? filtered : data.slice(0, limit);

  return source.map((item: any) => {
    const gp = gpFromProduct(Number(item.selling_price || 0), Number(item.total_cost || 0), Number(item.target_gp || 0) || 45);
    return {
      id: String(item.id),
      name: cleanProductName(String(item.product_name || "Product")),
      category: String(item.category || "Handcrafted Product"),
      metric: `${Math.round(gp)}% GP`,
      status: gp >= 50 ? "Healthy" : gp >= 35 ? "Review" : "Risk",
      impact: formatMoney(Number(item.selling_price || 0) - Number(item.total_cost || 0)),
    };
  });
}

export async function getRecipeRows(limit = 120): Promise<SimpleRow[]> {
  if (!supabase) return demoRecipeRows;

  const { data, error } = await supabase
    .from("vyron_cost_recipes")
    .select("id, recipe_name, recipe_type, category, total_cost, yield_qty, status")
    .order("recipe_name", { ascending: true })
    .limit(1000);

  if (error || !data || data.length === 0) return demoRecipeRows;

  const filtered = data
    .filter((item: any) => isHandcraftedDemoProduct(String(item.recipe_name || ""), String(item.category || item.recipe_type || "")))
    .slice(0, limit);

  const source = filtered.length ? filtered : data.slice(0, limit);

  return source.map((item: any) => ({
    id: String(item.id),
    name: cleanProductName(String(item.recipe_name || "Recipe")),
    category: String(item.category || item.recipe_type || "Recipe"),
    metric: formatMoney(Number(item.total_cost || 0)),
    status: String(item.status || "Active"),
    impact: `${Number(item.yield_qty || 0).toFixed(2)} yield`,
  }));
}

export async function getIngredientRows(limit = 120): Promise<SimpleRow[]> {
  if (!supabase) return demoIngredientRows;

  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("id, ingredient_name, category, purchase_cost, true_unit_cost, current_alert")
    .order("ingredient_name", { ascending: true })
    .limit(limit);

  if (error || !data || data.length === 0) return demoIngredientRows;

  return data.map((item: any) => ({
    id: String(item.id),
    name: String(item.ingredient_name || "Ingredient"),
    category: String(item.category || "Ingredient"),
    metric: formatMoney(Number(item.true_unit_cost || item.purchase_cost || 0)),
    status: item.current_alert ? "Review" : "Active",
    impact: item.current_alert || "Stable",
  }));
}

export async function getSupplierRows(limit = 120): Promise<SimpleRow[]> {
  if (!supabase) return demoSupplierRows;

  const { data, error } = await supabase
    .from("vyron_cost_suppliers")
    .select("id, supplier_name, category, risk_status, last_price_movement")
    .order("supplier_name", { ascending: true })
    .limit(limit);

  if (error || !data || data.length === 0) return demoSupplierRows;

  return data.map((item: any) => ({
    id: String(item.id),
    name: String(item.supplier_name || "Supplier"),
    category: String(item.category || "Supplier"),
    metric: `${Number(item.last_price_movement || 0).toFixed(1)}% movement`,
    status: String(item.risk_status || "Active"),
    impact: Number(item.last_price_movement || 0) > 5 ? "Price review" : "Monitor",
  }));
}

export const demoDashboardProducts: DashboardProductCard[] = [
  { id: "demo-1", name: "Pepper Steak Pie", category: "Handcrafted Pies", gp: 69, sellingPrice: 45, totalCost: 14, emoji: "🥧", tone: "green", badge: "Strong Performer" },
  { id: "demo-2", name: "Steak & Kidney Pie", category: "Handcrafted Pies", gp: 62, sellingPrice: 45, totalCost: 17, emoji: "🥧", tone: "blue", badge: "Good Performer" },
  { id: "demo-3", name: "Chicken & Mushroom Pie", category: "Handcrafted Pies", gp: 38, sellingPrice: 42, totalCost: 26, emoji: "🥧", tone: "red", badge: "Under Target" },
  { id: "demo-4", name: "Puff Pastry 400g", category: "Pastry", gp: 55, sellingPrice: 35, totalCost: 16, emoji: "🥐", tone: "blue", badge: "Good Performer" },
  { id: "demo-5", name: "Boerewors Sausage Roll", category: "Sausage Rolls", gp: 48, sellingPrice: 30, totalCost: 16, emoji: "🌭", tone: "amber", badge: "Review Margin" },
];

export const demoProductRows: SimpleRow[] = demoDashboardProducts.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  metric: `${p.gp}% GP`,
  status: p.badge,
  impact: formatMoney(p.sellingPrice - p.totalCost),
}));

export const demoRecipeRows: SimpleRow[] = [
  { id: "r1", name: "Puff Pastry 400g", category: "Pastry", metric: "R12", status: "Active", impact: "1.00 yield" },
  { id: "r2", name: "Pepper Steak CROWN", category: "Pie Filling", metric: "R18", status: "Active", impact: "1.00 yield" },
  { id: "r3", name: "Steak & Kidney CROWN", category: "Pie Filling", metric: "R19", status: "Active", impact: "1.00 yield" },
];

export const demoIngredientRows: SimpleRow[] = [
  { id: "i1", name: "Beef", category: "Protein", metric: "R92", status: "Review", impact: "Price movement" },
  { id: "i2", name: "Flour", category: "Dry Goods", metric: "R18", status: "Active", impact: "Stable" },
];

export const demoSupplierRows: SimpleRow[] = [
  { id: "s1", name: "Meat Supplier", category: "Protein", metric: "12.4% movement", status: "High", impact: "Review pricing" },
  { id: "s2", name: "Packaging Supplier", category: "Packaging", metric: "8.7% movement", status: "Medium", impact: "Negotiate" },
];
