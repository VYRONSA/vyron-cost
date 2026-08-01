"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import type { ContractRow } from "@/lib/vyron-enterprise-platform";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function ContractsClient({ contracts }: { contracts: ContractRow[] }) {
  const renewals = contracts.filter((c) => c.renewalAlert);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Contracts",
        subtitle: "Premium VYRON COST workflow for contracts.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            {renewals.length ? (
              <div className="rounded-[2rem] border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] p-6">
                <h3 className="font-black text-[var(--vyron-warning-fg)]">Renewal alerts ({renewals.length})</h3>
                <ul className="mt-3 space-y-2">
                  {renewals.map((c) => (
                    <li key={c.id}>
                      <Link href={c.href} className="text-sm font-bold text-[var(--vyron-warning-fg)] hover:underline">
                        {c.supplierName} — {c.title} · {c.daysToExpiry} days
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <EnterpriseScrollContainer className="rounded-[2rem] bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-left text-[10px] font-black uppercase text-[#A855F7]">
                    <th className="p-4">Supplier</th>
                    <th className="p-4">Contract</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">End</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="p-4 font-bold">{c.supplierName}</td>
                      <td className="p-4">
                        <Link href={c.href} className="font-black text-violet-700 hover:underline">
                          {c.title}
                        </Link>
                      </td>
                      <td className="p-4 capitalize">{c.contractType}</td>
                      <td className="p-4">{c.endDate || "—"}</td>
                      <td className="p-4">
                        <span className={c.renewalAlert ? "font-black text-[var(--vyron-warning-fg)]" : ""}>{c.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnterpriseScrollContainer>
          </section>
    </VyronPremiumPageShell>
  );
}
