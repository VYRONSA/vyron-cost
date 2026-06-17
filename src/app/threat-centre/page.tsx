import ThreatCentrePanel from "@/components/ThreatCentrePanel";
import VyronCostShell from "@/components/VyronCostShell";
import { getLeakageKpis } from "@/lib/vyron-financial-command-data";

export default async function ThreatCentrePage() {
  const kpis = await getLeakageKpis();
  return (
    <VyronCostShell hidePageHeader title="Threat Centre" subtitle="Active financial threats and profit leakage signals.">
      <ThreatCentrePanel kpis={kpis} />
    </VyronCostShell>
  );
}
