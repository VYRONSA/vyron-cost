"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import PaginatedTableControls from "@/components/PaginatedTableControls";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/vyron-cost-data";
import { InvoiceRiskFinding } from "@/lib/vyron-leakage-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const PAGE_SIZE = 8;

function riskTone(score: number): "red" | "amber" | "emerald" | "slate" {
  if (score >= 85) return "red";
  if (score >= 70) return "amber";
  if (score >= 50) return "slate";
  return "emerald";
}

export default function InvoiceForensicsClient({ rows }: { rows: InvoiceRiskFinding[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.invoice_number || "",
        row.supplier_name || "",
        row.risk_type || "",
        row.review_status || "",
        row.duplicate_of || "",
        String(row.invoice_amount || ""),
        String(row.risk_score || ""),
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
        title: "Invoice Forensics",
        subtitle: "Premium VYRON COST workflow for invoice forensics.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-violet-100 bg-violet-50/50 px-4 py-3">
                <Search size={20} className="text-violet-700" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Search invoice forensics..."
                  className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="rounded-full vyron-grad-surface px-4 py-2 text-xs font-semibold text-white">
                  {filtered.length} flagged
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="min-w-[1180px]">
                <div className="grid grid-cols-9 bg-violet-800 px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-violet-100">
                  <div>Invoice</div>
                  <div>Supplier</div>
                  <div>Amount</div>
                  <div>Risk Type</div>
                  <div>AI Score</div>
                  <div>AI Conf</div>
                  <div>Duplicate Of</div>
                  <div>Status</div>
                  <div>Action</div>
                </div>

                {paged.map((row) => (
                  <div key={row.id} className="grid grid-cols-9 items-center border-t border-slate-100 px-5 py-5 text-sm">
                    <div className="font-black text-[#F8FAFC]">{row.invoice_number}</div>
                    <div>{row.supplier_name}</div>
                    <div>{formatMoney(Number(row.invoice_amount || 0))}</div>
                    <div className="font-black text-red-700">{row.risk_type}</div>
                    <div>
                      <StatusPill tone={riskTone(Number(row.risk_score || 0))}>{Number(row.risk_score || 0).toFixed(1)}</StatusPill>
                    </div>
                    <div>{Number(row.ai_confidence || 0).toFixed(0)}%</div>
                    <div>{row.duplicate_of || "—"}</div>
                    <div>{row.review_status}</div>
                    <div>
                      <Link href="/invoice-centre" className="rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-3 py-2 text-xs font-black text-[#7E22CE]">
                        Open
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
