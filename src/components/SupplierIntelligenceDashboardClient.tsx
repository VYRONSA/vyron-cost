"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import { formatSupplierSpend, SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-data";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumIntelligencePanel,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

export default function SupplierIntelligenceDashboardClient({ rows }: { rows: SupplierIntelRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.supplier_name,
        row.category,
        row.recommended_action,
        String(row.price_movement_percent),
        String(row.supplier_risk_score),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="suppliers"
        badge="Premium Supplier Intelligence"
        title="Supplier Intelligence Hub"
        subtitle="See which suppliers are increasing prices, creating margin risk, invoice irregularities or negotiation opportunities — before you approve the next PO."
        outcomes={[
          "Rank suppliers by spend and price movement",
          "Spot duplicate invoice and variance risk",
          "Prioritise negotiation and contract review",
          "Protect margin before procurement commits",
        ]}
        quotes={[
          { label: "Procurement", quote: "Profit is often won before stock arrives." },
          { label: "Cost control", quote: "Small cost leaks become large financial problems." },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <VyronPremiumFormulaCard
          eyebrow="Supplier risk"
          title="Supplier intelligence signals"
          formulas={[
            { label: "Price Movement", formula: "(Current cost − Prior cost) ÷ Prior cost × 100" },
            { label: "Spend Exposure", formula: "Σ PO and invoice value by supplier (period)" },
            { label: "Risk Score", formula: "Movement + variance + reliability + duplicate flags" },
          ]}
        />
        <VyronPremiumIntelligencePanel
          title="Supplier Intelligence"
          items={[
            { label: "Inflation", detail: "Suppliers with rising ingredient costs need repricing or renegotiation first." },
            { label: "Reliability", detail: "Late or partial delivery disrupts production and working capital." },
            { label: "Invoice match", detail: "Variance and duplicate risk erode 3-way match discipline." },
          ]}
        />
      </div>

      <VyronPremiumSectionHeading eyebrow="Supplier register" title="Intelligence by supplier" subtitle="Search and rank suppliers before approving POs or repricing products." />

      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search suppliers..." resultCount={filtered.length} />

      {!rows.length ? (
        <VyronPremiumEmptyState
          steps={[
            "Create suppliers in the Supplier Performance Centre.",
            "Link ingredients and capture purchase costs.",
            "Process supplier invoices through document intelligence.",
            "Return here to analyse movement, risk and negotiation priorities.",
          ]}
        />
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white/72 shadow-[var(--vyron-elev-2)] backdrop-blur-xl backdrop-saturate-150 shadow-[0_2px_16px_rgba(0,0,0,0.14)]">
        <div className="min-w-[1400px]">
          <div className="grid grid-cols-12 bg-[#2a2448] px-5 py-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
            <div className="col-span-2">Supplier</div>
            <div>Category</div>
            <div>Spend</div>
            <div>Movement</div>
            <div>Ingredients</div>
            <div>Invoices</div>
            <div>Dup Risk</div>
            <div>Variance</div>
            <div>Reliability</div>
            <div>Negotiation</div>
            <div>Risk</div>
            <div>Action</div>
          </div>
          {filtered.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="grid grid-cols-12 items-center border-t border-white/10 px-5 py-4 text-sm text-[#CBD5E1] transition hover:bg-[#A855F7]/5"
            >
              <div className="col-span-2 font-bold text-[#F8FAFC]">{row.supplier_name}</div>
              <div>{row.category}</div>
              <div>{formatSupplierSpend(row.current_spend)}</div>
              <div className="font-bold text-[var(--vyron-warning-fg)]">{row.price_movement_percent.toFixed(1)}%</div>
              <div>{row.linked_ingredients}</div>
              <div>{row.invoice_count}</div>
              <div>{row.duplicate_invoice_risk}</div>
              <div>{formatSupplierSpend(row.price_variance)}</div>
              <div>{row.reliability_score}</div>
              <div className="font-bold text-[#A855F7]">{formatSupplierSpend(row.negotiation_opportunity)}</div>
              <div className="font-bold text-[var(--vyron-warning-fg)]">{row.supplier_risk_score}</div>
              <div className="text-xs font-semibold text-[#94A3B8]">{row.recommended_action}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
