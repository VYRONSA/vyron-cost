"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-data";

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
    <section className="grid gap-5 md:grid-cols-2">
      {checks.map(([label, count, href]) => {
        const bad = Number(count) > 0;
        return (
          <Link key={String(label)} href={String(href)} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:bg-emerald-50">
            {bad ? <AlertTriangle className="text-amber-600" size={28} /> : <CheckCircle2 className="text-emerald-700" size={28} />}
            <div className="mt-5 text-4xl font-black text-[#07110d]">{String(count)}</div>
            <h3 className="mt-2 text-xl font-black text-[#07110d]">{label}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">Open linked module to fix or confirm.</p>
          </Link>
        );
      })}
    </section>
  );
}
