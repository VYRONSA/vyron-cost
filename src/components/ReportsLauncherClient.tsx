"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import ReportOptionCard from "@/components/ReportOptionCard";
import { BarChart3, Boxes, FileSpreadsheet, LineChart, PackageSearch, Percent, ShieldAlert, TrendingUp, Truck, Wallet } from "lucide-react";

const reportCards = [
  { href: "/reports/open-purchase-orders", title: "Open Purchase Orders", description: "POs still open, approved, sent or partially received.", icon: FileSpreadsheet, badge: "Procurement" },
  { href: "/reports/partially-received-pos", title: "Outstanding Purchase Orders", description: "POs with outstanding quantities and supplier follow-up risk.", icon: Truck, badge: "Procurement" },
  { href: "/purchase-orders/back-orders", title: "Back Orders", description: "Outstanding PO lines awaiting delivery. Opens source PO and receive balance.", icon: PackageSearch, badge: "Procurement" },
  { href: "/reports/grn-variances", title: "GRN Variances", description: "Goods receipt records for quantity, damaged and rejected stock checks.", icon: Boxes, badge: "GRN" },
  { href: "/reports/invoices-awaiting-approval", title: "Invoices Awaiting Approval", description: "Supplier invoices extracted but not yet approved or archived.", icon: FileSpreadsheet, badge: "Documents" },
  { href: "/reports/duplicate-invoice-risks", title: "Duplicate Invoice Risks", description: "Once-off duplicate invoice exposure, potential recovery and confidence.", icon: ShieldAlert, badge: "Recovery" },
  { href: "/reports/supplier-price-increases", title: "Supplier Price Increases", description: "Supplier price movement from approved invoices and cost history.", icon: TrendingUp, badge: "Supplier" },
  { href: "/supplier-intelligence", title: "Supplier Performance", description: "Supplier movement, risk, reliability and procurement exposure.", icon: Truck, badge: "Supplier" },
  { href: "/inventory", title: "Stock Valuation", description: "Inventory master value, low stock and slow-moving stock visibility.", icon: Boxes, badge: "Inventory" },
  { href: "/inventory/counts", title: "Stock Variance", description: "Stock count variance workflow: draft, submit, approve and post.", icon: PackageSearch, badge: "Inventory" },
  { href: "/reports/product-margins", title: "Product GP", description: "GP performance, margin gaps and selling price analysis.", icon: Percent, badge: "Costing" },
  { href: "/reports/product-costings", title: "Recipe Cost Report", description: "Full product costing breakdowns and BOM-linked cost lines.", icon: FileSpreadsheet, badge: "Costing" },
  { href: "/reports/ingredient-movement", title: "Ingredient Cost Report", description: "Ingredient price movement, yield impact and purchase cost trends.", icon: TrendingUp, badge: "Costing" },
  { href: "/reports/category-usage", title: "Category Usage Report", description: "Master-data category usage across suppliers, products and recipes.", icon: LineChart, badge: "Costing" },
  { href: "/financial-leakage", title: "Recovery Opportunities", description: "Potential recovery, confidence and financial leakage intelligence.", icon: Wallet, badge: "Recovery" },
  { href: "/forecasting", title: "Forecast Report", description: "GP, COGS and margin risk forecast for 30/60/90 days.", icon: BarChart3, badge: "Forecast", dark: true },
];

export default function ReportsLauncherClient() {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return reportCards;
    return reportCards.filter((card) => [card.title, card.description, card.badge].join(" ").toLowerCase().includes(term));
  }, [search]);

  return (
    <section className="grid gap-6">
      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search procurement, supplier, inventory, costing and recovery reports…" resultCount={filtered.length} />
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((card) => <ReportOptionCard key={`${card.title}-${card.href}`} {...card} />)}
      </section>
      <section className="mt-5 rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] print:hidden">
        <Link href="/dashboard" className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white">
          Return to command centre
        </Link>
      </section>
    </section>
  );
}
