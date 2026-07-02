import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { computeSpendTotals } from "@/lib/vyron-finance-intelligence";
import { getInventoryDashboardStats } from "@/lib/vyron-inventory";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { getIngredients } from "@/lib/vyron-cost-data";
import { getSuppliers } from "@/lib/vyron-cost-core-data";

export type BudgetCategory =
  | "supplier_spend"
  | "inventory"
  | "production"
  | "packaging"
  | "ingredients";

export type BudgetPeriod = "monthly" | "quarterly" | "annual";

export type BudgetRow = {
  id: string;
  category: BudgetCategory;
  categoryLabel: string;
  periodType: BudgetPeriod;
  periodLabel: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
};

export type BudgetDashboard = {
  rows: BudgetRow[];
  totals: { budget: number; actual: number; variance: number };
  byPeriod: Record<BudgetPeriod, { budget: number; actual: number }>;
};

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  supplier_spend: "Supplier Spend",
  inventory: "Inventory",
  production: "Production",
  packaging: "Packaging",
  ingredients: "Ingredients",
};

function periodLabel(type: BudgetPeriod, start: Date) {
  if (type === "monthly") return start.toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
  if (type === "quarterly") {
    const q = Math.floor(start.getMonth() / 3) + 1;
    return `Q${q} ${start.getFullYear()}`;
  }
  return String(start.getFullYear());
}

async function computeActuals(companyId: string) {
  const supabase = getSupabaseAdmin();
  const [spend, ingredients] = await Promise.all([
    supabase
      ? computeSpendTotals(supabase, companyId).catch(() => ({ spendThisMonth: 0, spendThisYear: 0 }))
      : Promise.resolve({ spendThisMonth: 0, spendThisYear: 0 }),
    getIngredients(500).catch(() => []),
  ]);

  let inventoryValue = 0;
  let productionCost = 0;
  if (supabase) {
    try {
      const [inv, mfg] = await Promise.all([
        getInventoryDashboardStats(supabase, companyId),
        getManufacturingDashboardStats(supabase, companyId),
      ]);
      inventoryValue = inv.totalInventoryValue;
      productionCost = mfg.productionCost;
    } catch {
      inventoryValue = 0;
      productionCost = 0;
    }
  }

  const packagingSpend = ingredients
    .filter((i) => /pack/i.test(String(i.category || "")))
    .reduce((s, i) => s + Number(i.purchase_cost || 0) * 80, 0);
  const ingredientSpend = ingredients
    .filter((i) => !/pack/i.test(String(i.category || "")))
    .reduce((s, i) => s + Number(i.purchase_cost || 0) * 100, 0);

  const suppliers = await getSuppliers().catch(() => []);
  const supplierSpendMonth = suppliers.reduce((s, sup) => s + Number(sup.last_price_movement || 0) * 500 + 8000, 0);

  return {
    supplier_spend: spend.spendThisMonth || supplierSpendMonth,
    inventory: inventoryValue,
    production: productionCost,
    packaging: packagingSpend,
    ingredients: ingredientSpend,
  };
}

function defaultBudget(actual: number, category: BudgetCategory) {
  const buffer = category === "inventory" ? 1.05 : 1.12;
  return Math.round(actual * buffer);
}

export async function getBudgetDashboard(companyId = VYRON_DEFAULT_TENANT_ID): Promise<BudgetDashboard> {
  const supabase = getSupabaseAdmin();
  const actuals = await computeActuals(companyId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  let dbRows: Array<{
    id: string;
    budget_category: string;
    period_type: string;
    period_start: string;
    budget_amount: number;
  }> = [];

  if (supabase) {
    try {
      const { data } = await supabase
        .from("vyron_enterprise_budgets")
        .select("id, budget_category, period_type, period_start, budget_amount")
        .eq("company_id", companyId)
        .gte("period_end", monthStart.toISOString().slice(0, 10));
      dbRows = (data || []) as typeof dbRows;
    } catch {
      dbRows = [];
    }
  }

  const categories: BudgetCategory[] = ["supplier_spend", "inventory", "production", "packaging", "ingredients"];
  const periods: Array<{ type: BudgetPeriod; start: Date }> = [
    { type: "monthly", start: monthStart },
    { type: "quarterly", start: quarterStart },
    { type: "annual", start: yearStart },
  ];

  const rows: BudgetRow[] = [];

  for (const cat of categories) {
    const actualBase = actuals[cat];
    for (const p of periods) {
      const db = dbRows.find(
        (r) => r.budget_category === cat && r.period_type === p.type && r.period_start?.startsWith(p.start.toISOString().slice(0, 7))
      );
      const mult = p.type === "monthly" ? 1 : p.type === "quarterly" ? 3 : 12;
      const actual = Math.round(actualBase * mult * 100) / 100;
      const budget = db ? Number(db.budget_amount) : defaultBudget(actual, cat);
      const variance = actual - budget;
      const variancePct = budget > 0 ? (variance / budget) * 100 : 0;
      rows.push({
        id: db?.id || `${cat}-${p.type}`,
        category: cat,
        categoryLabel: CATEGORY_LABELS[cat],
        periodType: p.type,
        periodLabel: periodLabel(p.type, p.start),
        budget,
        actual,
        variance: Math.round(variance * 100) / 100,
        variancePct: Math.round(variancePct * 10) / 10,
      });
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      if (r.periodType !== "monthly") return acc;
      return {
        budget: acc.budget + r.budget,
        actual: acc.actual + r.actual,
        variance: acc.variance + r.variance,
      };
    },
    { budget: 0, actual: 0, variance: 0 }
  );

  const byPeriod = {} as BudgetDashboard["byPeriod"];
  for (const pt of ["monthly", "quarterly", "annual"] as BudgetPeriod[]) {
    const subset = rows.filter((r) => r.periodType === pt);
    byPeriod[pt] = {
      budget: subset.reduce((s, r) => s + r.budget, 0),
      actual: subset.reduce((s, r) => s + r.actual, 0),
    };
  }

  return { rows, totals, byPeriod };
}
