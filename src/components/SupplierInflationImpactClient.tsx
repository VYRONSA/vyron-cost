"use client";

import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import PaginatedTableControls from "@/components/PaginatedTableControls";
import StatusPill from "@/components/StatusPill";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VyronPremiumEmptyState } from "@/components/vyron-premium/VyronPremiumSprint";
import { formatMoney } from "@/lib/vyron-cost-data";
import { SupplierInflationRow } from "@/lib/vyron-demo-data";

const PAGE_SIZE = 8;

function tone(level: string): "red" | "amber" | "emerald" | "slate" {
  const v = level.toLowerCase();
  if (v.includes("critical")) return "red";
  if (v.includes("high") || v.includes("medium")) return "amber";
  if (v.includes("low")) return "emerald";
  return "slate";
}

export default function SupplierInflationImpactClient({ rows }: { rows: SupplierInflationRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.supplier_name, row.category, row.recommended_action].join(" ").toLowerCase().includes(term)
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalAnnual = rows.reduce((s, r) => s + r.annual_impact, 0);

  if (!rows.length) {
    return (
      <VyronPremiumPageShell
        config={{
        visualVariant: "suppliers",
          badge: "Inflation Intelligence",
          title: "Supplier Inflation Impact Centre",
          subtitle: "Assess supplier-led inflation pressure on annual cost exposure and mitigation actions.",
          outcomes: ["Quantify annual inflation impact", "Prioritize high-risk suppliers", "Trigger corrective supplier actions"],
          formulas: ["Inflation % = (Current - Previous) / Previous", "Annual Impact from supplier exposure model", "Risk score aligns inflation and spend stress"],
          intelligenceItems: [
            { label: "Current dataset", detail: "No rows loaded in this context" },
            { label: "Action readiness", detail: "Populate supplier inflation feed to activate table analytics" },
          ],
        }}
      >
        <VyronPremiumEmptyState
          title="No Inflation Data Yet"
          steps={[
            "Sync supplier price history",
            "Rebuild inflation impact dataset",
            "Return to review annual impact and actions",
          ]}
        />
      </VyronPremiumPageShell>
    );
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        badge: "Inflation Intelligence",
        title: "Supplier Inflation Impact Centre",
        subtitle: "Assess supplier-led inflation pressure on annual cost exposure and mitigation actions.",
        outcomes: ["Quantify annual inflation impact", "Prioritize high-risk suppliers", "Trigger corrective supplier actions"],
        formulas: ["Inflation % = (Current - Previous) / Previous", "Annual Impact from supplier exposure model", "Risk score aligns inflation and spend stress"],
        intelligenceItems: [
          { label: "Suppliers tracked", detail: `${rows.length} suppliers in inflation model` },
          { label: "Total annual impact", detail: formatMoney(totalAnnual) },
          { label: "Filtered rows", detail: `${filtered.length} records after search filter` },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Annual Supplier Impact</div>
        <div className="mt-2 text-3xl font-black">{formatMoney(totalAnnual)}</div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3">
          <Search size={20} className="text-[#65A30D]" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search suppliers..."
            className="w-full bg-transparent text-sm font-black outline-none"
          />
        </div>
      </div>

        <div className="overflow-x-auto rounded-[2rem] border border-white bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[1100px]">
          <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
            <div>Supplier</div>
            <div>Current</div>
            <div>Previous</div>
            <div>Inflation</div>
            <div>Annual</div>
            <div>Risk</div>
            <div>Action</div>
          </div>
          {paged.map((row) => (
            <div key={row.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
              <div>
                <div className="font-black text-[#F8FAFC]">{row.supplier_name}</div>
                <div className="text-xs text-slate-500">{row.category}</div>
              </div>
              <div>{formatMoney(Number(row.current_cost || 0))}</div>
              <div>{formatMoney(Number(row.previous_cost || 0))}</div>
              <div className="font-black text-red-700">+{row.price_movement_percent.toFixed(1)}%</div>
              <div className="font-black text-red-700">{formatMoney(row.annual_impact)}</div>
              <div>
                <StatusPill tone={tone(row.risk_level)}>
                  {row.risk_score != null ? `${row.risk_score}` : row.risk_level}
                </StatusPill>
              </div>
              <div>
                <Link href="/action-centre" className="inline-flex items-center gap-1 rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]">
                  {row.recommended_action}
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <PaginatedTableControls page={page} pageCount={pageCount} setPage={setPage} total={filtered.length} />
        </div>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
