"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChefHat,
  Package,
  RefreshCcw,
  ShoppingCart,
  TrendingDown,
  Truck,
} from "lucide-react";
import type { TenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import type { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";

const M = VYRON_MASTER;

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

type SuggestedAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "warning" | "info";
};

export default function CostIntelligenceCentreClient({
  intelligence,
  companyName,
}: {
  intelligence: TenantCostIntelligence | null;
  companyName: string;
}) {
  const router = useRouter();
  const summary = intelligence?.summary;
  const products = intelligence?.products ?? [];

  const productsNeedingReprice = useMemo(
    () => products.filter((row) => Number(row.gp_gap ?? 0) < 0),
    [products]
  );

  const productsMissingPrice = useMemo(
    () => products.filter((row) => !Number(row.selling_price)),
    [products]
  );

  const productsMissingCost = useMemo(
    () => products.filter((row) => !Number(row.total_cost)),
    [products]
  );

  const bomMovementCount = intelligence?.bomCostMovement.length ?? 0;
  const supplierInflationCount = intelligence?.supplierInflation.length ?? 0;

  const suggestedActions = useMemo<SuggestedAction[]>(() => {
    if (!intelligence) return [];

    const actions: SuggestedAction[] = [];

    if (productsNeedingReprice.length > 0) {
      actions.push({
        id: "reprice-below-gp",
        title: "Reprice products below target GP",
        detail: `${productsNeedingReprice.length} product(s) are below target gross profit.`,
        href: "/reports/product-margins",
        severity: "critical",
      });
    }

    if (productsNeedingReprice.length > 0) {
      actions.push({
        id: "review-low-margin",
        title: "Review low-margin products",
        detail: "Validate cost build-up, supplier pricing and selling price discipline.",
        href: "/products",
        severity: "warning",
      });
    }

    if (supplierInflationCount > 0) {
      actions.push({
        id: "supplier-inflation",
        title: "Check supplier price movement",
        detail: `${supplierInflationCount} supplier(s) show recorded price movement.`,
        href: "/document-intelligence/price-history/supplier",
        severity: "warning",
      });
    }

    if (bomMovementCount > 0) {
      actions.push({
        id: "bom-movement",
        title: "Review BOM ingredient cost movement",
        detail: `${bomMovementCount} ingredient(s) with cost movement affecting finished product cost.`,
        href: "/recipes",
        severity: "warning",
      });
    }

    if (productsMissingCost.length > 0) {
      actions.push({
        id: "missing-bom-cost",
        title: "Review BOMs missing cost data",
        detail: `${productsMissingCost.length} product(s) have no total cost on record.`,
        href: "/recipes",
        severity: "info",
      });
    }

    if (productsMissingPrice.length > 0) {
      actions.push({
        id: "missing-selling-price",
        title: "Review products without selling prices",
        detail: `${productsMissingPrice.length} product(s) need a selling price for margin analysis.`,
        href: "/products",
        severity: "info",
      });
    }

    if (actions.length === 0) {
      actions.push({
        id: "monitor",
        title: "Continue monitoring cost and margin",
        detail: "No critical cost intelligence signals detected on current product and supplier data.",
        href: "/reports/product-margins",
        severity: "info",
      });
    }

    return actions;
  }, [
    intelligence,
    productsNeedingReprice.length,
    supplierInflationCount,
    bomMovementCount,
    productsMissingCost.length,
    productsMissingPrice.length,
  ]);

  const hasData = Boolean(intelligence && products.length > 0);

  return (
    <div className="space-y-6">
      <header className={M.moduleHeaderNavy}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#CBD5E1]">
                Cost Intelligence
              </div>
              <h1 className={`text-3xl tracking-tight md:text-4xl ${M.headingOnDark}`}>Cost Intelligence Centre</h1>
              <p className={`mt-2 max-w-3xl text-sm font-medium leading-6 ${M.bodyOnDark}`}>
                Analyse true product cost, margin pressure, supplier inflation and BOM movement for{" "}
                <span className="font-bold text-white">{companyName}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.refresh()}
              className={`shrink-0 ${M.secondaryBtn} px-4 py-2 text-sm`}
            >
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {!hasData ? (
        <section className={M.moduleDataSection}>
          <h2 className="text-xl font-bold text-[#0F172A]">Cost intelligence not available yet</h2>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Load products, BOM links, supplier costs and target GP so VYRON COST can analyse margin pressure.
          </p>
          <ul className="mt-4 space-y-2 text-sm font-medium text-[#334155]">
            <li>· Add products with selling prices and target GP</li>
            <li>· Link recipes/BOMs and ingredient purchase costs</li>
            <li>· Capture supplier price movement from procurement and GRNs</li>
            <li>· Post customer invoices to validate realised margin</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/products" className={`${M.primaryBtn} px-4 py-2 text-sm`}>
              Products
            </Link>
            <Link href="/recipes" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Recipes &amp; BOM
            </Link>
            <Link href="/suppliers" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Suppliers
            </Link>
            <Link href="/purchase-orders" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
              Purchase Orders
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Below target GP"
              value={String(summary?.erosionCount ?? 0)}
              href="/reports/product-margins"
              icon={TrendingDown}
              accent="#E11D48"
            />
            <KpiCard
              label="Need repricing"
              value={String(summary?.repricingCount ?? 0)}
              href="/products"
              icon={AlertTriangle}
              accent="#F43F5E"
            />
            <KpiCard
              label="Supplier inflation"
              value={String(summary?.inflationSuppliers ?? 0)}
              href="/document-intelligence/price-history/supplier"
              icon={Truck}
              accent="#9333EA"
            />
            <KpiCard
              label="BOM movement"
              value={String(bomMovementCount)}
              href="/recipes"
              icon={ChefHat}
              accent="#7C3AED"
            />
          </section>

          <section className={M.moduleDataSection}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">Product margin table</h2>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Current cost, selling price, GP variance and suggested repricing.
                </p>
              </div>
              <Link href="/reports/product-margins" className={`${M.secondaryBtn} px-4 py-2 text-sm`}>
                Full margin report
              </Link>
            </div>

            <div className={`mt-4 ${M.tableSurface}`}>
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full text-sm">
                  <thead>
                    <tr className={VYRON_TABLE.head}>
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-right">Current cost</th>
                      <th className="px-4 py-3 text-right">Selling price</th>
                      <th className="px-4 py-3 text-right">GP %</th>
                      <th className="px-4 py-3 text-right">Target GP %</th>
                      <th className="px-4 py-3 text-right">Variance</th>
                      <th className="px-4 py-3 text-right">Suggested price</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={8} className={`px-4 py-10 text-center ${VYRON_TABLE.empty}`}>
                          No products found for this workspace.
                        </td>
                      </tr>
                    ) : (
                      products.map((row) => (
                        <ProductMarginRow key={row.id} row={row} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className={M.moduleDataSection}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#0F172A]">Supplier inflation impact</h2>
                  <p className="mt-1 text-sm font-medium text-[#64748B]">
                    Suppliers with recorded price movement from master data.
                  </p>
                </div>
                <Link href="/suppliers" className={`${M.secondaryBtn} px-3 py-2 text-xs`}>
                  Suppliers
                </Link>
              </div>

              {intelligence!.supplierInflation.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                  <p className="text-sm font-semibold text-[#64748B]">
                    No supplier price movement recorded yet.
                  </p>
                  <p className="mt-2 text-xs font-medium text-[#94A3B8]">
                    Process purchase orders and GRNs, or update supplier master costs to build inflation signals.
                  </p>
                  <Link href="/purchase-orders" className="mt-3 inline-flex text-sm font-bold text-[#7C3AED]">
                    Open purchase orders →
                  </Link>
                </div>
              ) : (
                <div className={`mt-4 ${M.tableSurface}`}>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className={VYRON_TABLE.head}>
                        <th className="px-4 py-3 text-left">Supplier</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-right">Movement</th>
                        <th className="px-4 py-3 text-left">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intelligence!.supplierInflation.map((row) => (
                        <tr key={row.supplierName} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{row.supplierName}</td>
                          <td className="px-4 py-3 text-[#64748B]">{row.category}</td>
                          <td className="px-4 py-3 text-right font-bold text-[#E11D48]">{pct(row.movementPct)}</td>
                          <td className="px-4 py-3">
                            <RiskBadge level={row.riskLevel} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={M.moduleDataSection}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#0F172A]">BOM movement analysis</h2>
                  <p className="mt-1 text-sm font-medium text-[#64748B]">
                    Ingredient cost movement affecting recipe and finished product cost.
                  </p>
                </div>
                <Link href="/recipes" className={`${M.secondaryBtn} px-3 py-2 text-xs`}>
                  Recipes &amp; BOM
                </Link>
              </div>

              {intelligence!.bomCostMovement.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                  <p className="text-sm font-semibold text-[#64748B]">
                    No ingredient cost movement detected.
                  </p>
                  <p className="mt-2 text-xs font-medium text-[#94A3B8]">
                    Add ingredients with current and previous purchase costs, or import procurement price history.
                  </p>
                  <Link href="/ingredients" className="mt-3 inline-flex text-sm font-bold text-[#7C3AED]">
                    Open ingredients →
                  </Link>
                </div>
              ) : (
                <div className={`mt-4 ${M.tableSurface}`}>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className={VYRON_TABLE.head}>
                        <th className="px-4 py-3 text-left">Ingredient</th>
                        <th className="px-4 py-3 text-right">Previous</th>
                        <th className="px-4 py-3 text-right">Current</th>
                        <th className="px-4 py-3 text-right">Movement</th>
                        <th className="px-4 py-3 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intelligence!.bomCostMovement.map((row) => (
                        <tr key={row.productName} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{row.productName}</td>
                          <td className="px-4 py-3 text-right text-[#64748B]">{money(row.previousCost)}</td>
                          <td className="px-4 py-3 text-right font-medium text-[#334155]">{money(row.currentCost)}</td>
                          <td className="px-4 py-3 text-right font-bold text-[#7C3AED]">{pct(row.movementPct)}</td>
                          <td className="px-4 py-3 text-[#64748B]">{row.impact}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className={M.moduleDataSection}>
            <h2 className="text-xl font-bold text-[#0F172A]">Suggested actions</h2>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Prioritised cost and margin actions derived from current workspace data.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {suggestedActions.map((action) => (
                <Link
                  key={action.id}
                  href={action.href}
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 transition hover:border-[#7C3AED]/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-[#0F172A]">{action.title}</span>
                    <ActionSeverityBadge severity={action.severity} />
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#64748B]">{action.detail}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#7C3AED]">
                    Open <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className={M.moduleDataSection}>
            <h2 className="text-lg font-bold text-[#0F172A]">Module drilldowns</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Product margins", href: "/reports/product-margins" },
                { label: "Products", href: "/products" },
                { label: "Recipes & BOM", href: "/recipes" },
                { label: "Suppliers", href: "/suppliers" },
                { label: "Purchase orders", href: "/purchase-orders" },
                { label: "Inventory stock", href: "/inventory/stock" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-2 text-sm font-semibold text-[#334155] transition hover:border-[#7C3AED]/30 hover:text-[#7C3AED]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  href,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  href: string;
  icon: typeof Package;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className={`${M.moduleDataSection} block p-5 transition hover:border-[#7C3AED]/30 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{label}</div>
          <div className="mt-2 text-2xl font-bold" style={{ color: accent }}>
            {value}
          </div>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center ${M.iconSubtle}`}>
          <Icon size={20} />
        </div>
      </div>
    </Link>
  );
}

function ProductMarginRow({ row }: { row: ProductIntelligenceRow }) {
  const variance = Number(row.gp_gap ?? 0);
  const varianceClass = variance < 0 ? "text-[#E11D48]" : variance > 0 ? "text-emerald-700" : "text-[#64748B]";
  const productHref = row.product_id ? `/products/${row.product_id}` : "/products";

  return (
    <tr className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
      <td className="px-4 py-3">
        <div className="font-semibold text-[#0F172A]">{row.product_name || "Unnamed product"}</div>
        {row.category ? <div className="text-xs font-medium text-[#64748B]">{row.category}</div> : null}
      </td>
      <td className="px-4 py-3 text-right text-[#334155]">{money(Number(row.total_cost || 0))}</td>
      <td className="px-4 py-3 text-right text-[#334155]">
        {Number(row.selling_price) ? money(Number(row.selling_price)) : "—"}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-[#334155]">{pct(row.actual_gp)}</td>
      <td className="px-4 py-3 text-right text-[#64748B]">{pct(row.target_gp)}</td>
      <td className={`px-4 py-3 text-right font-bold ${varianceClass}`}>{pct(variance)}</td>
      <td className="px-4 py-3 text-right font-semibold text-[#7C3AED]">
        {Number(row.suggested_price) ? money(Number(row.suggested_price)) : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={productHref} className="text-xs font-bold text-[#7C3AED]">
          {row.action_required || "Review"} →
        </Link>
      </td>
    </tr>
  );
}

function RiskBadge({ level }: { level: string }) {
  const lower = level.toLowerCase();
  const classes =
    lower.includes("critical")
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : lower.includes("high")
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-[#E2E8F0] bg-[#F6F7FB] text-[#64748B]";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${classes}`}>{level}</span>
  );
}

function ActionSeverityBadge({ severity }: { severity: SuggestedAction["severity"] }) {
  const classes = {
    critical: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#7C3AED]",
  };
  const labels = { critical: "Critical", warning: "Review", info: "Monitor" };
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${classes[severity]}`}>
      {labels[severity]}
    </span>
  );
}
