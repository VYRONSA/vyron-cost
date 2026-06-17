import Link from "next/link";
import VyronCostShell from "@/components/VyronCostShell";
import SupplierProfileClient from "@/components/SupplierProfileClient";
import { getSupplierIntelligenceProfile } from "@/lib/vyron-supplier-intelligence-centre";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function SupplierIntelligenceProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getWorkspaceCompanyId();

  try {
    if (!companyId) throw new Error("No active workspace");
    const profile = await getSupplierIntelligenceProfile(id, companyId);
    return (
      <VyronCostShell hidePageHeader title={profile.supplier.supplierName}
        subtitle="SUPPLIER INTELLIGENCE · SPEND · RISK · PERFORMANCE · OPPORTUNITIES"
      >
        <div className="mb-6">
          <Link href="/supplier-intelligence" className="text-sm font-black text-violet-700 hover:underline">
            ← Supplier Intelligence Centre
          </Link>
        </div>
        <SupplierProfileClient profile={profile} />
      </VyronCostShell>
    );
  } catch {
    return (
      <VyronCostShell hidePageHeader title="Supplier Not Found" subtitle="SUPPLIER INTELLIGENCE">
        <div className="rounded-[2rem] bg-white p-8 text-sm font-bold text-slate-600">
          Supplier not found or intelligence could not be loaded.{" "}
          <Link href="/supplier-intelligence" className="text-violet-700 hover:underline">
            Return to centre
          </Link>
        </div>
      </VyronCostShell>
    );
  }
}
