import { AuditIntelligenceClient } from "@/components/vyron-finance/VyronFinanceModuleClients";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function AuditIntelligencePage() {
  const { auditIntelligence } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="Audit Intelligence Centre" subtitle="DUPLICATES · APPROVALS · OVERRIDES · VARIANCES · STOCK">
      <FinanceNav />
      <AuditIntelligenceClient findings={auditIntelligence} />
    </VyronCostShell>
  );
}
