import ReportsLauncherClient from "@/components/ReportsLauncherClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function ReportsPage() {
  return (
    <VyronCostAiShell title="Reports Centre" subtitle="Open · print · export CSV · demo-ready report routing" hidePageHeader>
      <ReportsLauncherClient />
    </VyronCostAiShell>
  );
}
