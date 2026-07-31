import AiCfoCommandCentreClient from "@/components/ai-financial/AiCfoCommandCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";

export default async function AiCfoCommandCentrePage() {
  const data = await getAiFinancialIntelligence();

  return (
    <VyronCostShell hidePageHeader title="AI CFO Command Centre"
      subtitle="VYRON INTELLIGENCE · FINANCIAL HEALTH · LEAKAGE · NARRATIVES · ALERTS"
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/ai-cfo-command-centre/leakage" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black">
          Profit leakage
        </Link>
        <Link href="/ai-cfo-command-centre/budget" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black">
          Budget vs actual
        </Link>
        <Link href="/ai-cfo-command-centre/forecast" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black">
          AI forecasting
        </Link>
        <Link href="/ai-cfo-command-centre/strategic" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black">
          Strategic modelling
        </Link>
        <Link href="/ai-cfo-command-centre/benchmarks" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black">
          Benchmarks
        </Link>
        <Link href="/boardroom-insights" className="rounded-xl vyron-grad-surface px-3 py-2 text-xs font-semibold text-white">
          Boardroom insights
        </Link>
      </div>
      <AiCfoCommandCentreClient data={data} />
    </VyronCostShell>
  );
}
