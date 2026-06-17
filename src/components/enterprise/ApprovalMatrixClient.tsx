"use client";

import type { ApprovalMatrixPayload } from "@/lib/vyron-enterprise-approval-matrix";
import { poTierLabel } from "@/lib/vyron-enterprise-approval-matrix";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(n: number) {
  return `R${n.toLocaleString("en-ZA")}`;
}

export default function ApprovalMatrixClient({ data }: { data: ApprovalMatrixPayload }) {
  const grouped = data.rules.reduce(
    (acc, r) => {
      if (!acc[r.entityType]) acc[r.entityType] = [];
      acc[r.entityType].push(r);
      return acc;
    },
    {} as Record<string, typeof data.rules>
  );

  return (
    <VyronPremiumPageShell
      config={{
        title: "Approval Matrix",
        subtitle: "Premium VYRON COST workflow for approval matrix.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-violet-50 p-5">
                <div className="text-xs font-black uppercase text-violet-600">PO auto-approve below</div>
                <div className="mt-2 text-2xl font-black">{money(data.poRules.autoApproveBelow)}</div>
              </div>
              <div className="rounded-2xl bg-violet-50 p-5">
                <div className="text-xs font-black uppercase text-violet-600">Supervisor threshold</div>
                <div className="mt-2 text-2xl font-black">{money(data.poRules.supervisorApproveBelow)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-5">
                <div className="text-xs font-black uppercase text-slate-500">Example R30k PO</div>
                <div className="mt-2 text-lg font-black">{poTierLabel(30000, data.poRules)}</div>
              </div>
            </div>
            {Object.entries(grouped).map(([entity, rules]) => (
              <div key={entity} className="rounded-[2rem] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black capitalize">{entity.replace(/_/g, " ")}</h3>
                <div className="mt-4 space-y-2">
                  {rules
                    .sort((a, b) => a.approvalLevel - b.approvalLevel)
                    .map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                        <span className="font-bold">{r.ruleName}</span>
                        <span className="text-xs font-black text-violet-700">
                          L{r.approvalLevel} · {r.thresholdType} ≥ {r.thresholdValue} · {r.approverRole.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </section>
    </VyronPremiumPageShell>
  );
}
