"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import PaginatedTableControls from "@/components/PaginatedTableControls";
import StatusPill from "@/components/StatusPill";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { LeakageFinding } from "@/lib/vyron-leakage-intelligence-data";

const PAGE_SIZE = 8;

function severityTone(severity: string | null): "red" | "amber" | "emerald" | "slate" {
  const value = String(severity || "").toLowerCase();
  if (value.includes("critical")) return "red";
  if (value.includes("high")) return "amber";
  if (value.includes("low")) return "slate";
  return "slate";
}

function isDuplicate(row: LeakageFinding) {
  return String(row.finding_type || row.title || "").toLowerCase().includes("duplicate");
}

function recoveryRate(row: LeakageFinding) {
  const type = String(row.finding_type || "").toLowerCase();
  if (type.includes("duplicate")) return 1;
  if (type.includes("supplier") || type.includes("inflation")) return 0.65;
  if (type.includes("margin")) return 0.85;
  if (type.includes("wastage")) return 0.7;
  if (type.includes("branch")) return 0.6;
  return 0.75;
}

function exposureValue(row: LeakageFinding) {
  return Number(row.estimated_monthly_loss || 0);
}

function recoveryValue(row: LeakageFinding) {
  const exposure = exposureValue(row);
  return exposure * recoveryRate(row);
}

export default function FinancialLeakageClient({ findings }: { findings: LeakageFinding[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return findings;
    return findings.filter((row) =>
      [
        row.finding_type || "",
        row.title || "",
        row.description || "",
        row.severity || "",
        row.status || "",
        row.branch_name || "",
        row.category_name || "",
        row.supplier_name || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [findings, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        badge: "Leakage Intelligence",
        title: "Financial Leakage Intelligence Centre",
        subtitle: "Surface recoverable margin leakage with explainable exposure and action tracking.",
        outcomes: ["Prioritize highest-value leakage", "Separate duplicates from recurring loss", "Direct teams to recoverable actions"],
        formulas: ["Potential Recovery = Exposure x Recovery Rate", "Duplicate exposure treated as once-off", "Non-duplicate leakage annualizes via monthly trends"],
        intelligenceItems: [
          { label: "Findings in scope", detail: `${filtered.length} records in current filter` },
          { label: "Duplicate controls", detail: "Duplicate invoice risks isolated for immediate action" },
          { label: "Recovery focus", detail: "Confidence-based recovery view aligns finance and ops" },
        ],
      }}
    >
      <div className="min-w-0 space-y-5">
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-violet-100 bg-violet-50/50 px-4 py-3">
        <Search size={20} className="shrink-0 text-violet-700" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Search recovery findings..."
          className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
        />
        <div className="shrink-0 rounded-full bg-violet-700 px-4 py-2 text-xs font-black text-white">
          {filtered.length} findings
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-2xl border border-violet-100">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-violet-800 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
              <th className="px-4 py-4">Type</th>
              <th className="px-4 py-4">Finding</th>
              <th className="px-4 py-4">Exposure</th>
              <th className="px-4 py-4">Potential Recovery</th>
              <th className="px-4 py-4">Severity</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Scope</th>
              <th className="px-4 py-4">Explain</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => {
              const duplicate = isDuplicate(row);
              const exposure = exposureValue(row);
              const recovery = recoveryValue(row);

              return (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-4 font-black text-violet-700">{row.finding_type}</td>
                  <td className="max-w-[280px] px-4 py-4">
                    <div className="font-black text-slate-950">{row.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.description}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-red-600">{formatMoney(exposure)}</div>
                    <div className="text-[11px] font-bold text-slate-400">
                      {duplicate ? "Duplicate exposure" : "Monthly leakage"}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-violet-700">{formatMoney(recovery)}</div>
                    <div className="text-[11px] font-bold text-slate-400">
                      {duplicate ? "Once-off recoverable" : `${Math.round(recoveryRate(row) * 100)}% recoverable`}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill tone={severityTone(row.severity)}>{row.severity || "Medium"}</StatusPill>
                  </td>
                  <td className="px-4 py-4">{row.status}</td>
                  <td className="px-4 py-4">{duplicate ? row.supplier_name || "—" : row.branch_name || row.category_name || "—"}</td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/financial-leakage/${row.id}`}
                      className="inline-flex rounded-full bg-violet-100 px-3 py-2 text-xs font-black text-violet-700"
                    >
                      Explain →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

        <PaginatedTableControls page={page} pageCount={pageCount} setPage={setPage} total={filtered.length} />
      </div>
    </VyronPremiumPageShell>
  );
}
