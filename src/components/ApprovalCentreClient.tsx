"use client";

import { CheckCircle2, Search, ShieldAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/vyron-cost-data";
import { VyronApproval } from "@/lib/vyron-approval-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function tone(level: string | null): "red" | "amber" | "emerald" | "slate" {
  const value = String(level || "").toLowerCase();
  if (value.includes("critical") || value.includes("high")) return "red";
  if (value.includes("medium")) return "amber";
  if (value.includes("low")) return "emerald";
  return "slate";
}

export default function ApprovalCentreClient({
  approvals,
}: {
  approvals: VyronApproval[];
}) {
  const [items, setItems] = useState(approvals);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) =>
      [
        item.approval_type,
        item.entity_type || "",
        item.title || "",
        item.detail || "",
        item.risk_level || "",
        item.status || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [items, search]);

  async function decide(id: string, status: "Approved" | "Rejected") {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              approved_by: "Current User",
              decided_at: new Date().toISOString(),
            }
          : item
      )
    );

    if (supabase && !id.startsWith("approval")) {
      await supabase
        .from("vyron_cost_approvals")
        .update({
          status,
          approved_by: "Current User",
          decided_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Approval Centre",
        subtitle: "Premium VYRON COST workflow for approval centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3">
                <Search size={20} className="text-[#65A30D]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search approvals..."
                  className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-[#A3E635]">
                  {filtered.length} items
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {filtered.map((approval) => (
                <div
                  key={approval.id}
                  className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                        <ShieldAlert size={24} />
                      </div>

                      <div>
                        <div className="flex flex-wrap gap-2">
                          <StatusPill tone={tone(approval.risk_level)}>
                            {approval.risk_level || "Medium"}
                          </StatusPill>
                          <StatusPill tone="slate">{approval.approval_type}</StatusPill>
                          <StatusPill tone={approval.status === "Pending" ? "amber" : approval.status === "Approved" ? "emerald" : "red"}>
                            {approval.status || "Pending"}
                          </StatusPill>
                        </div>

                        <h2 className="mt-3 text-xl font-black text-[#F8FAFC]">
                          {approval.title}
                        </h2>

                        <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-500">
                          {approval.detail}
                        </p>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Current</div>
                            <div className="mt-1 text-lg font-black">{Number(approval.current_value || 0).toFixed(2)}</div>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Proposed</div>
                            <div className="mt-1 text-lg font-black">{Number(approval.proposed_value || 0).toFixed(2)}</div>
                          </div>
                          <div className="rounded-2xl bg-[#07110d] px-4 py-3 text-white">
                            <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">Impact</div>
                            <div className="mt-1 text-lg font-black">{formatMoney(Number(approval.financial_impact || 0))}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {approval.status === "Pending" && (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => decide(approval.id, "Approved")}
                          className="inline-flex items-center gap-2 rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-3 text-sm font-black text-[#F8FAFC]"
                        >
                          <CheckCircle2 size={18} />
                          Approve
                        </button>

                        <button
                          type="button"
                          onClick={() => decide(approval.id, "Rejected")}
                          className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                        >
                          <XCircle size={18} />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
