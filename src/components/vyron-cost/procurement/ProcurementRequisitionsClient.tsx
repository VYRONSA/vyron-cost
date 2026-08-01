"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import { Plus, Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import {
  PROCUREMENT_REQUISITION_STATUSES,
  PROCUREMENT_REQUISITION_STATUS_LABELS,
  type ProcurementRequisitionRow,
} from "@/lib/vyron-procurement-requisitions";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusClass(status: string) {
  if (status === "ReadyForPurchase") return "bg-violet-100 text-violet-800";
  if (status === "Approved") return "bg-violet-100 text-violet-800";
  if (status === "Ordered") return "bg-blue-100 text-blue-800";
  if (status === "Received") return "bg-slate-100 text-slate-700";
  if (status === "Cancelled") return "bg-rose-100 text-rose-800";
  return "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
}

export default function ProcurementRequisitionsClient() {
  const [requisitions, setRequisitions] = useState<ProcurementRequisitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function loadRequisitions() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/procurement-requisitions?${params.toString()}`);
      const data = await response.json();
      if (data.ok && Array.isArray(data.requisitions)) {
        setRequisitions(data.requisitions as ProcurementRequisitionRow[]);
        return;
      }
      setRequisitions([]);
      setError(data.error || "Could not load requisitions.");
    } catch {
      setRequisitions([]);
      setError("Could not load requisitions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequisitions();
  }, [statusFilter]);

  async function generateFromShortages() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/procurement-requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "production_planning", created_by: "user" }),
      });
      const data = await response.json();
      if (!data.ok || !data.requisition?.id) {
        setError(data.error || "Could not generate requisition.");
        return;
      }
      window.location.href = `/procurement/${data.requisition.id}`;
    } catch {
      setError("Could not generate requisition.");
    } finally {
      setGenerating(false);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return requisitions;
    return requisitions.filter((row) =>
      [row.requisition_number, row.status, row.notes].join(" ").toLowerCase().includes(term)
    );
  }, [requisitions, search]);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Procurement Intelligence",
        title: "Procurement Requisitions",
        subtitle: "Convert production and inventory shortages into procurement requirements.",
        outcomes: [
          "Generate requisitions from planning shortages",
          "Track approval through ready-for-purchase",
          "Supplier recommendations as non-blocking warnings",
        ],
      }}
      actions={
        <button
          type="button"
          disabled={generating}
          onClick={() => void generateFromShortages()}
          className={`${VYRON_MASTER.primaryBtn} inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-60`}
        >
          <Plus size={16} />
          {generating ? "Generating…" : "Generate from Shortages"}
        </button>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {["All", ...PROCUREMENT_REQUISITION_STATUSES].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    statusFilter === status ? "bg-[#1D6BFF] text-white" : "bg-[#F1F5F9] text-[#64748B]"
                  }`}
                >
                  {status === "All" ? "All" : PROCUREMENT_REQUISITION_STATUS_LABELS[status as keyof typeof PROCUREMENT_REQUISITION_STATUS_LABELS] || status}
                </button>
              ))}
            </div>
            <div className="relative min-w-[220px] flex-1 md:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadRequisitions()}
                placeholder="Search requisitions…"
                className="w-full rounded-xl border border-[#E2E8F0] py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm font-semibold text-[#64748B]">Loading requisitions…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E2E8F0] px-4 py-10 text-center">
              <ShoppingCart className="mx-auto mb-3 text-[#94A3B8]" size={28} />
              <p className="text-sm font-semibold text-[#64748B]">No procurement requisitions yet.</p>
              <p className="mt-1 text-xs text-[#94A3B8]">Generate from production planning or inventory shortages.</p>
            </div>
          ) : (
            <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
              <table className="min-w-full">
                <thead className={VYRON_TABLE.head}>
                  <tr>
                    <th className="px-4 py-3 text-left">Requisition #</th>
                    <th className="px-4 py-3 text-left">Required Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Estimated Cost</th>
                    <th className="px-4 py-3 text-right">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className={VYRON_TABLE.row}>
                      <td className="px-4 py-3">
                        <Link href={`/procurement/${row.id}`} className="font-bold text-[#1D6BFF] hover:underline">
                          {row.requisition_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">{row.required_date || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass(row.status)}`}>
                          {PROCUREMENT_REQUISITION_STATUS_LABELS[row.status as keyof typeof PROCUREMENT_REQUISITION_STATUS_LABELS] || row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{formatMoney(row.estimated_cost || 0)}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.line_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnterpriseScrollContainer>
          )}
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
