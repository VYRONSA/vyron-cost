"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { LeakageFinding } from "@/lib/vyron-leakage-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default function RecoveryApprovalsClient({ findings }: { findings: LeakageFinding[] }) {
  const [decisions, setDecisions] = useState<Record<string, "Approved" | "Rejected" | "Pending">>({});

  const rows = useMemo(
    () =>
      findings.map((finding) => {
        const recovery = Number(finding.estimated_monthly_loss || 0) * recoveryRate(finding);
        return {
          ...finding,
          recovery,
          annual: recovery * 12,
          decision: decisions[finding.id] || "Pending",
        };
      }),
    [findings, decisions]
  );

  const approved = rows.filter((row) => row.decision === "Approved");
  const approvedMonthly = approved.reduce((sum, row) => sum + row.recovery, 0);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        title: "Recovery Approvals",
        subtitle: "Premium VYRON COST workflow for recovery approvals.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <section className="grid gap-5 md:grid-cols-3">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Pending Approvals</div>
                <div className="mt-3 text-4xl font-black text-amber-600">{rows.filter((row) => row.decision === "Pending").length}</div>
              </div>
              <div className="rounded-[2rem] bg-[#A3E635]/10 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#65A30D]">Approved Monthly Recovery</div>
                <div className="mt-3 text-4xl font-black text-[#65A30D]">{money(approvedMonthly)}</div>
              </div>
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">Annualised Approved</div>
                <div className="mt-3 text-4xl font-black">{money(approvedMonthly * 12)}</div>
              </div>
            </section>

            <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="min-w-[1100px]">
                <div className="grid grid-cols-9 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
                  <div>Type</div>
                  <div className="col-span-2">Recovery</div>
                  <div>Monthly</div>
                  <div>Annual</div>
                  <div>Severity</div>
                  <div>Status</div>
                  <div className="col-span-2">Decision</div>
                </div>

                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-9 items-center border-t border-slate-100 px-5 py-5 text-sm">
                    <div className="font-black text-[#65A30D]">{row.finding_type}</div>
                    <div className="col-span-2">
                      <div className="font-black text-[#F8FAFC]">{row.title}</div>
                      <div className="text-xs text-slate-500">{row.description}</div>
                    </div>
                    <div className="font-black text-[#65A30D]">{money(row.recovery)}</div>
                    <div>{money(row.annual)}</div>
                    <div>{row.severity}</div>
                    <div><StatusPill tone={row.decision === "Approved" ? "emerald" : row.decision === "Rejected" ? "red" : "amber"}>{row.decision}</StatusPill></div>
                    <div className="col-span-2 flex gap-2">
                      <button onClick={() => setDecisions((current) => ({ ...current, [row.id]: "Approved" }))} className="inline-flex items-center gap-2 rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]">
                        <CheckCircle2 size={14} /> Approve
                      </button>
                      <button onClick={() => setDecisions((current) => ({ ...current, [row.id]: "Rejected" }))} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
