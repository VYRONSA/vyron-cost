"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import type { SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-shared";

export default function DataQualityCentreClient({
  products,
  suppliers,
}: {
  products: ProductIntelligenceRow[];
  suppliers: SupplierIntelRow[];
}) {
  const checks = [
    ["Products with no product id", products.filter((p) => !p.product_id).length, "/products"],
    ["Products below target GP", products.filter((p) => Number(p.gp_gap || 0) > 0).length, "/product-profitability"],
    ["High risk suppliers", suppliers.filter((s) => Number(s.supplier_risk_score || 0) >= 75).length, "/supplier-intelligence"],
    ["Suppliers without linked ingredients", suppliers.filter((s) => Number(s.linked_ingredients || 0) === 0).length, "/supplier-intelligence"],
  ];

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Data Quality",
        title: "Data Quality Command Centre",
        subtitle: "Expose quality gaps across product and supplier intelligence before downstream decisions.",
        outcomes: ["Identify critical data gaps early", "Route teams directly to corrective modules", "Improve confidence in analytics outputs"],
        formulas: ["Quality Check Count = Records failing rule criteria", "Risk Flags from supplier and GP risk thresholds", "Action Path linked to corrective module"],
        intelligenceItems: [
          { label: "Checks active", detail: `${checks.length} quality checks in this centre` },
          { label: "Product scope", detail: `${products.length} product records screened` },
          { label: "Supplier scope", detail: `${suppliers.length} supplier records screened` },
        ],
      }}
    >
      <section className="grid gap-5 md:grid-cols-2">
        {checks.map(([label, count, href]) => {
        const bad = Number(count) > 0;
        return (
          <Link key={String(label)} href={String(href)} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:bg-[#A855F7]/10">
            {bad ? <AlertTriangle className="text-[var(--vyron-warning-fg)]" size={28} /> : <CheckCircle2 className="text-[#7E22CE]" size={28} />}
            <div className="mt-5 text-4xl font-black text-[#F8FAFC]">{String(count)}</div>
            <h3 className="mt-2 text-xl font-black text-[#F8FAFC]">{label}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">Open linked module to fix or confirm.</p>
          </Link>
        );
        })}
      </section>
    </VyronPremiumPageShell>
  );
}
