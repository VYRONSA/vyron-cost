import ExecutiveReportingClient from "@/components/ExecutiveReportingClient";
import VyronCostShell from "@/components/VyronCostShell";
import { buildBoardPackData, executiveReportCategories } from "@/lib/vyron-finance-intelligence";

export default async function ExecutiveReportingPage() {
  const boardPack = await buildBoardPackData("Current month to date");

  return (
    <VyronCostShell hidePageHeader title="Executive Reporting Centre"
      subtitle="PROCUREMENT · INVENTORY · MANUFACTURING · SUPPLIER · RECOVERY · FINANCE · AUDIT"
    >
      <ExecutiveReportingClient categories={executiveReportCategories} boardPack={boardPack} />
    </VyronCostShell>
  );
}
