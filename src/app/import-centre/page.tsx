import VyronCostAiShell from "@/components/VyronCostAiShell";
import EnterpriseImportCentreClient from "@/components/vyron-cost/imports/EnterpriseImportCentreClient";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  getImportOperationsCentreData,
  type ImportOperationsCentreData,
  type ImportOperationalSnapshot,
} from "@/lib/vyron-import-operations-centre";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function Page() {
  const totalImportTypes = 6;
  let operationsData: ImportOperationsCentreData = {
    summary: {
      totalImportTypes,
      successfulImportsToday: 0,
      failedImportsToday: 0,
      importsRunning: 0,
      lastImportExecuted: null,
    },
    snapshots: {} as Record<string, ImportOperationalSnapshot>,
  };

  try {
    if (isSupabaseServiceRoleConfigured()) {
      const supabase = getSupabaseAdmin();
      const companyId = await getWorkspaceCompanyId();
      if (supabase && companyId) {
        operationsData = await getImportOperationsCentreData(supabase, companyId, totalImportTypes);
      }
    }
  } catch {
    // Non-blocking fallback to empty operational snapshot.
  }

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Import Centre"
      subtitle="IMPORT RAW MATERIALS, FINISHED GOODS, AND BOMS INTO YOUR WORKSPACE."
    >
      <EnterpriseImportCentreClient operationsData={operationsData} />
    </VyronCostAiShell>
  );
}
