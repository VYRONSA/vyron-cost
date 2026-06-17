import WhatIfSimulatorClient from "@/components/WhatIfSimulatorClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getWhatIfScenario } from "@/lib/vyron-financial-command-data";

export default async function WhatIfSimulatorPage() {
  const scenario = await getWhatIfScenario();

  return (
    <VyronCostShell hidePageHeader title="What-If Simulator" subtitle="COST INCREASE IMPACT · GP · PRICE ACTION">
      <WhatIfSimulatorClient scenario={scenario} />
    </VyronCostShell>
  );
}
