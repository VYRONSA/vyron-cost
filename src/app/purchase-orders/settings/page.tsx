import PurchaseOrderSettingsClient from "@/components/PurchaseOrderSettingsClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { DEFAULT_PO_APPROVAL_RULES, getPoApprovalRules } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export default async function PurchaseOrderSettingsPage() {
  const { companyId, useDemo } = await workspaceScope();
  let initialRules = { ...DEFAULT_PO_APPROVAL_RULES };
  let companyResolved = Boolean(companyId);

  if (companyId && isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        initialRules = await getPoApprovalRules(supabase, companyId);
      } catch {
        companyResolved = false;
      }
    }
  } else if (!useDemo) {
    companyResolved = false;
  }

  return (
    <VyronCostAiShell hidePageHeader title="PO Approval Settings" subtitle="Thresholds and invoice linking policy">
      <PurchaseOrderSettingsClient initialRules={initialRules} initialCompanyResolved={companyResolved} />
    </VyronCostAiShell>
  );
}
