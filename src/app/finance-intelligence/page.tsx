import FinanceIntelligenceClient from "@/components/FinanceIntelligenceClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getFinanceIntelligenceKpis, getFinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";
import Link from "next/link";

export default async function FinanceIntelligencePage() {
  const [kpis, leakage] = await Promise.all([getFinanceIntelligenceKpis(), getFinanceLeakageCentre()]);

  return (
    <VyronCostShell hidePageHeader title="Finance Intelligence Centre"
      subtitle="CFO VIEW · SPEND · RECOVERY · INFLATION · PROJECTED IMPACT"
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/executive-reporting" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-black text-white">
          Executive Reporting →
        </Link>
        <Link href="/board-pack-centre" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white">
          Board Pack Generator →
        </Link>
        <Link href="/accounting-export-centre" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black">
          Accounting Exports →
        </Link>
      </div>
      <FinanceIntelligenceClient kpis={kpis} leakage={leakage} />
    </VyronCostShell>
  );
}
