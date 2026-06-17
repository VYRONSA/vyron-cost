import AiProfitLeakageClient from "@/components/ai-financial/AiProfitLeakageClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";

export default async function AiProfitLeakagePage() {
  const { leakage } = await getAiFinancialIntelligence();

  return (
    <VyronCostShell hidePageHeader title="Profit Leakage Intelligence" subtitle="MONTHLY · ANNUAL · RECOVERED · POTENTIAL · MISSED">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-violet-700">
        ← AI CFO Command Centre
      </Link>
      <AiProfitLeakageClient leakage={leakage} />
    </VyronCostShell>
  );
}
