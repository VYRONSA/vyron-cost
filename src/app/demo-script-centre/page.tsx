import DemoScriptCentreClient from "@/components/DemoScriptCentreClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function DemoScriptCentrePage() {
  return (
    <VyronCostShell hidePageHeader title="Demo Script Centre"
      subtitle="CLIENT MEETING FLOW · SALES STORY · RECOVERY CLOSE"
    >
      <DemoScriptCentreClient />
    </VyronCostShell>
  );
}
