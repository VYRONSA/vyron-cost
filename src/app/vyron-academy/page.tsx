import VyronAcademyClient from "@/components/enterprise/VyronAcademyClient";
import VyronCostShell from "@/components/VyronCostShell";
import { VYRON_ACADEMY_GUIDES } from "@/lib/vyron-academy-content";

export default function VyronAcademyPage() {
  return (
    <VyronCostShell hidePageHeader title="VYRON COST Academy" subtitle="SETUP · COSTING · PROCUREMENT · INVENTORY · MANUFACTURING · RECOVERY">
      <VyronAcademyClient guides={VYRON_ACADEMY_GUIDES} />
    </VyronCostShell>
  );
}
