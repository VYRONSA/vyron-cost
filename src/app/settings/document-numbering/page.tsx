import VyronCostAiShell from "@/components/VyronCostAiShell";
import DocumentNumberingClient from "@/components/settings/DocumentNumberingClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export const dynamic = "force-dynamic";

export default async function DocumentNumberingPage() {
  const { session } = await requireWorkspacePage("invoices.view");
  return (
    <VyronCostAiShell hidePageHeader title="Document Numbering" subtitle="SEQUENTIAL, AUDITED NUMBERING FOR INVOICES AND JOB CARDS.">
      <DocumentNumberingClient canConfigure={sessionHasPermission(session, "admin.company")} />
    </VyronCostAiShell>
  );
}
