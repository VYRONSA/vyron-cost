import Link from "next/link";
import { packageUpgradeLabel } from "@/lib/vyron-package-modules";
import type { PackageModuleKey } from "@/lib/vyron-package-modules";

export default function ModuleUpgradeNotice({
  packageName,
  moduleKey,
}: {
  packageName: string;
  moduleKey: PackageModuleKey;
}) {
  return (
    <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
      <h1 className="text-2xl font-black text-amber-950">Module not included</h1>
      <p className="mt-3 text-sm font-semibold text-amber-800">{packageUpgradeLabel(packageName, moduleKey)}</p>
      <Link href="/admin/company-setup" className="mt-6 inline-block rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-black text-white">
        View package details
      </Link>
    </div>
  );
}
