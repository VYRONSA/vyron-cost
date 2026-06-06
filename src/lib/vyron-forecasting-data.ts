import {
  calculateGpPercent,
  formatMoney,
  getIngredients,
  getProducts,
  getSuppliers,
} from "@/lib/vyron-cost-data";
import { getLeakageKpis } from "@/lib/vyron-financial-command-data";

export type ForecastHorizon = "30" | "60" | "90";

export type ForecastCard = {
  horizon: ForecastHorizon;
  label: string;
  gpForecast: number;
  cogsForecast: number;
  marginRiskCount: number;
  supplierInflationPct: number;
};

export type MarginRiskProduct = {
  id: string;
  name: string;
  category: string;
  currentGp: number;
  forecastGp: number;
  targetGp: number;
  risk: string;
  href: string;
};

export type ForecastSnapshot = {
  cards: ForecastCard[];
  marginRisks: MarginRiskProduct[];
  gpTrend: number[];
  inflationTrend: number[];
};

function horizonMultiplier(horizon: ForecastHorizon) {
  if (horizon === "30") return 1;
  if (horizon === "60") return 1.08;
  return 1.15;
}

export async function getForecastSnapshot(): Promise<ForecastSnapshot> {
  const [products, ingredients, suppliers, kpis] = await Promise.all([
    getProducts(120),
    getIngredients(120),
    getSuppliers(120),
    getLeakageKpis(),
  ]);

  const avgGp =
    products.length > 0
      ? products.reduce((sum, p) => sum + calculateGpPercent(Number(p.selling_price), Number(p.total_cost)), 0) /
        products.filter((p) => Number(p.selling_price) > 0).length
      : 63.7;

  const supplierInflation =
    suppliers.length > 0
      ? suppliers.reduce((sum, s) => sum + Number(s.last_price_movement || 0), 0) / suppliers.length
      : 8.4;

  const monthlyCogs = products.reduce((sum, p) => sum + Number(p.total_cost || 0) * 120, 0);
  const monthlyRevenue = products.reduce((sum, p) => sum + Number(p.selling_price || 0) * 120, 0);

  const cards: ForecastCard[] = (["30", "60", "90"] as ForecastHorizon[]).map((horizon) => {
    const mult = horizonMultiplier(horizon);
    const inflationDrag = 1 + (supplierInflation / 100) * (Number(horizon) / 30) * 0.4;
    const cogs = monthlyCogs * mult * inflationDrag;
    const revenue = monthlyRevenue * mult * 1.02;
    const gp = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : avgGp - supplierInflation * 0.3;

    return {
      horizon,
      label: `${horizon}-day`,
      gpForecast: Number(gp.toFixed(1)),
      cogsForecast: Number(cogs.toFixed(0)),
      marginRiskCount: products.filter((p) => {
        const current = calculateGpPercent(Number(p.selling_price), Number(p.total_cost));
        const forecastCost = Number(p.total_cost) * inflationDrag;
        const forecastGp = calculateGpPercent(Number(p.selling_price), forecastCost);
        return forecastGp < Number(p.target_gp || 40);
      }).length,
      supplierInflationPct: Number((supplierInflation * (Number(horizon) / 30)).toFixed(1)),
    };
  });

  const marginRisks: MarginRiskProduct[] = products
    .map((product) => {
      const currentGp = calculateGpPercent(Number(product.selling_price), Number(product.total_cost));
      const forecastCost = Number(product.total_cost) * (1 + supplierInflation / 100);
      const forecastGp = calculateGpPercent(Number(product.selling_price), forecastCost);
      const targetGp = Number(product.target_gp || 40);
      return {
        id: product.id,
        name: product.product_name,
        category: product.category,
        currentGp: Number(currentGp.toFixed(1)),
        forecastGp: Number(forecastGp.toFixed(1)),
        targetGp,
        risk: forecastGp < targetGp ? (forecastGp < targetGp - 8 ? "Critical" : "High") : "Watch",
        href: `/products/${product.id}`,
      };
    })
    .filter((row) => row.forecastGp < row.targetGp)
    .sort((a, b) => a.forecastGp - b.forecastGp)
    .slice(0, 12);

  if (!marginRisks.length) {
    marginRisks.push(
      {
        id: "demo-1",
        name: "Chicken Pie",
        category: "Handcrafted Pies",
        currentGp: 38,
        forecastGp: 34,
        targetGp: 42,
        risk: "High",
        href: "/products",
      },
      {
        id: "demo-2",
        name: "Steak & Kidney Pie",
        category: "Pies",
        currentGp: 41,
        forecastGp: 36,
        targetGp: 40,
        risk: "Critical",
        href: "/products",
      }
    );
  }

  const ingredientMoves = ingredients.slice(0, 6).map((i) => Number(i.purchase_cost || 0));
  const gpTrend = [avgGp + 2, avgGp + 1.2, avgGp, avgGp - 0.8, avgGp - 1.4, cards[0].gpForecast];
  const inflationTrend =
    ingredientMoves.length > 3
      ? ingredientMoves.map((v, idx) => v * (1 + idx * 0.02))
      : [6.2, 7.1, 7.8, 8.4, 9.0, supplierInflation + kpis.procurementAnomalies * 0.01];

  return { cards, marginRisks, gpTrend, inflationTrend };
}

export function formatForecastMoney(value: number) {
  return formatMoney(value);
}
