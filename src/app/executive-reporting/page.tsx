import ExecutiveReportingClient from "@/components/ExecutiveReportingClient";
import VyronCostShell from "@/components/VyronCostShell";
import { buildBoardPackData, executiveReportCategories } from "@/lib/vyron-finance-intelligence";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function ExecutiveReportingPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const boardPack = await buildBoardPackData("Current month to date", companyId);

  return (
    <VyronCostShell hidePageHeader title="Executive Reporting Centre"
      subtitle="PROCUREMENT · INVENTORY · MANUFACTURING · SUPPLIER · RECOVERY · FINANCE · AUDIT"
    >
      <ExecutiveReportingClient categories={executiveReportCategories} boardPack={boardPack} />
    </VyronCostShell>
  );
}
