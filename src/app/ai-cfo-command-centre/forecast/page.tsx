import { AiForecastClient } from "@/components/ai-financial/AiFinancialModulesClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";

export default async function AiForecastPage() {
  const { forecast } = await getAiFinancialIntelligence();

  return (
    <VyronCostShell hidePageHeader title="AI Financial Forecasting" subtitle="30 · 90 · 365 DAYS · CASH · INFLATION · RECOVERY">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-violet-700">
        ← AI CFO Command Centre
      </Link>
      <AiForecastClient forecast={forecast} />
    </VyronCostShell>
  );
}
