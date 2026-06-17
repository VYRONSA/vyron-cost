"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import PaginatedTableControls from "@/components/PaginatedTableControls";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/vyron-cost-data";
import { BranchRiskFinding } from "@/lib/vyron-leakage-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const PAGE_SIZE = 6;

function levelTone(level: string | null): "red" | "amber" | "emerald" | "slate" {
  const value = String(level || "").toLowerCase();
  if (value.includes("critical")) return "red";
  if (value.includes("high")) return "amber";
  if (value.includes("low")) return "emerald";
  return "slate";
}

export default function BranchIntelligenceClient({ rows }: { rows: BranchRiskFinding[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.branch_name || "", row.risk_level || "", String(row.leakage_score || ""), String(row.spend_total || "")]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Branch Intelligence",
        subtitle: "Premium VYRON COST workflow for branch intelligence.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3">
                <Search size={20} className="text-[#65A30D]" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Search branch intelligence..."
                  className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-[#A3E635]">
                  {filtered.length} branches
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-white bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="min-w-[1200px]">
                <div className="grid grid-cols-9 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
                  <div>Branch</div>
                  <div>Spend</div>
                  <div>Wastage</div>
                  <div>Invoices</div>
                  <div>GP Erosion</div>
                  <div>Procurement</div>
                  <div>Leakage</div>
                  <div>Risk</div>
                  <div>Status</div>
                </div>

                {paged.map((row) => (
                  <div key={row.id} className="grid grid-cols-9 items-center border-t border-slate-100 px-5 py-5 text-sm">
                    <div className="font-black text-[#F8FAFC]">{row.branch_name}</div>
                    <div>{formatMoney(Number(row.spend_total || 0))}</div>
                    <div className="font-black text-red-700">{formatMoney(Number(row.wastage_estimate || 0))}</div>
                    <div>{Number(row.invoice_volume || 0)}</div>
                    <div>{Number(row.gp_erosion_percent || 0).toFixed(1)}%</div>
                    <div>{Number(row.procurement_efficiency || 0).toFixed(0)}%</div>
                    <div className="font-black text-red-700">{Number(row.leakage_score || 0).toFixed(1)}</div>
                    <div>
                      <StatusPill tone={levelTone(row.risk_level)}>{row.risk_level}</StatusPill>
                    </div>
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      {Number(row.leakage_score || 0) >= 60 ? "Investigate" : "Monitor"}
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
