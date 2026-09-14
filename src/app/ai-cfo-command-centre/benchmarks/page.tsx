import { AiBenchmarksClient } from "@/components/ai-financial/AiFinancialModulesClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function AiBenchmarksPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { industry, multiCompany } = await getAiFinancialIntelligence(companyId);

  return (
    <VyronCostShell hidePageHeader title="Industry & Group Benchmarking" subtitle="MULTI-COMPANY · FOOD · HOSPITALITY · RETAIL · DISTRIBUTION">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-blue-700">
        ← AI CFO Command Centre
      </Link>
      <AiBenchmarksClient industry={industry} multiCompany={multiCompany} />
    </VyronCostShell>
  );
}
