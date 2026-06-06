import FraudDetectionClient from "@/components/enterprise/FraudDetectionClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getFraudAlerts } from "@/lib/vyron-enterprise-platform";

export default async function FraudDetectionPage() {
  const alerts = await getFraudAlerts();
  return (
    <VyronCostShell title="Fraud & Anomaly Detection" subtitle="DUPLICATES · SPIKES · OVERRIDES · COLLUSION">
      <FraudDetectionClient alerts={alerts} />
    </VyronCostShell>
  );
}
