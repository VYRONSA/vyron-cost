"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import PaginatedTableControls from "@/components/PaginatedTableControls";
import StatusPill from "@/components/StatusPill";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { ProcurementRiskFinding } from "@/lib/vyron-leakage-intelligence-data";

const PAGE_SIZE = 8;

function riskTone(score: number): "red" | "amber" | "emerald" | "slate" {
  if (score >= 80) return "red";
  if (score >= 65) return "amber";
  return "slate";
}

export default function ProcurementRiskClient({ rows }: { rows: ProcurementRiskFinding[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.supplier_name || "",
        row.category_name || "",
        row.risk_type || "",
        row.action_required || "",
        String(row.price_change_percent || ""),
        String(row.spend_amount || ""),
      ]
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
        visualVariant: "procurement",
        badge: "Risk Intelligence",
        title: "Procurement Risk Intelligence Centre",
        subtitle: "Monitor supplier risk pressure, spend exposure, and required action from one command view.",
        outcomes: ["Surface highest procurement risk quickly", "Link risk movement to spend exposure", "Direct action from risk table to approval"],
        formulas: ["Risk Score = Supplier and category risk signals", "Price Delta = Current vs baseline movement %", "Spend Exposure = Risked category spend amount"],
        intelligenceItems: [
          { label: "Risk universe", detail: `${rows.length} procurement risk records loaded` },
          { label: "Current focus", detail: `${filtered.length} records match current search` },
          { label: "Approval path", detail: "Action links route directly to review workflows" },
        ],
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
            placeholder="Search procurement risk..."
            className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
          />
          <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-[#A3E635]">
            {filtered.length} risks
          </div>
        </div>
      </div>

        <div className="overflow-x-auto rounded-[2rem] border border-white bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[1100px]">
          <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
            <div>Supplier</div>
            <div>Category</div>
            <div>Risk Type</div>
            <div>Score</div>
            <div>Price Δ</div>
            <div>Spend</div>
            <div>Action</div>
            <div>Review</div>
          </div>

          {paged.map((row) => (
            <div key={row.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-5 text-sm">
              <div className="font-black text-[#F8FAFC]">{row.supplier_name}</div>
              <div>{row.category_name}</div>
              <div className="font-black text-red-700">{row.risk_type}</div>
              <div>
                <StatusPill tone={riskTone(Number(row.risk_score || 0))}>{Number(row.risk_score || 0).toFixed(1)}</StatusPill>
              </div>
              <div className={Number(row.price_change_percent || 0) > 10 ? "font-black text-red-700" : ""}>
                {Number(row.price_change_percent || 0).toFixed(1)}%
              </div>
              <div>{formatMoney(Number(row.spend_amount || 0))}</div>
              <div className="text-xs font-black text-[#65A30D]">{row.action_required}</div>
              <div>
                <Link href="/approvals" className="rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]">
                  Approve
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
