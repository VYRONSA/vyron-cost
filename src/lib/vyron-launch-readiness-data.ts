import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";
import { getFinancialLeakageDashboard, getLeakageFindings } from "@/lib/vyron-leakage-intelligence-data";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getForecastSnapshot } from "@/lib/vyron-forecasting-data";
import { getEnterpriseInvoiceHeaders, getEnterpriseInvoiceLines } from "@/lib/vyron-enterprise-data";

export type LaunchReadinessSnapshot = {
  productCount: number;
  productsUnderGp: number;
  supplierCount: number;
  highRiskSuppliers: number;
  leakageFindings: number;
  monthlyLeakage: number;
  realisticMonthlyRecovery: number;
  invoiceCount: number;
  unmatchedInvoiceLines: number;
  forecastRiskProducts: number;
  readinessScore: number;
};

export async function getLaunchReadinessSnapshot(): Promise<LaunchReadinessSnapshot> {
  const [products, leakage, findings, suppliers, forecast, invoices, invoiceLines] = await Promise.all([
    getProductIntelligence(),
    getFinancialLeakageDashboard(),
    getLeakageFindings(),
    getSupplierIntelligenceRows(),
    getForecastSnapshot(),
    getEnterpriseInvoiceHeaders(),
    getEnterpriseInvoiceLines(),
  ]);

  const productsUnderGp = products.filter((row) => Number(row.gp_gap || 0) > 0).length;
  const highRiskSuppliers = suppliers.filter((row) => Number(row.supplier_risk_score || 0) >= 75).length;
  const unmatchedInvoiceLines = invoiceLines.filter((line) => !line.ingredient_name || Number(line.ai_confidence || 0) < 85).length;
  const forecastRiskProducts = forecast.marginRisks.length;
  const monthlyLeakage = Number(leakage.estimatedMonthlyLeakage || 0);
  const realisticMonthlyRecovery = monthlyLeakage * 0.72;

  const riskPenalty =
    productsUnderGp * 3 +
    highRiskSuppliers * 4 +
    unmatchedInvoiceLines * 2 +
    Math.min(20, forecastRiskProducts * 2);

  const readinessScore = Math.max(62, Math.min(98, 100 - riskPenalty));

  return {
    productCount: products.length,
    productsUnderGp,
    supplierCount: suppliers.length,
    highRiskSuppliers,
    leakageFindings: findings.length,
    monthlyLeakage,
    realisticMonthlyRecovery,
    invoiceCount: invoices.length,
    unmatchedInvoiceLines,
    forecastRiskProducts,
    readinessScore,
  };
}

export function formatLaunchMoney(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
