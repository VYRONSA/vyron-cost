import Link from "next/link";
import {
  getFeatureTooltip,
  getUpgradeMessage,
  getUpgradePackageLabel,
  type FeatureKey,
  type PackageModuleKey,
} from "@/lib/vyron-package-manager";

export default function ModuleUpgradeNotice({
  packageName,
  feature,
  moduleKey,
}: {
  packageName: string;
  feature?: FeatureKey;
  moduleKey?: PackageModuleKey;
}) {
  const resolvedFeature = feature || (moduleKey === "multi_store" ? "multi_store" : "dashboard");
  const title = `${getUpgradePackageLabel(resolvedFeature)} package`;
  const message = getUpgradeMessage(packageName, resolvedFeature);
  const tooltip = getFeatureTooltip(resolvedFeature);

  return (
    <div className="rounded-[2rem] border border-fuchsia-200 bg-fuchsia-50 p-8 text-center shadow-sm">
      <h1 className="text-2xl font-black text-fuchsia-950">{title}</h1>
      <p className="mt-3 text-sm font-semibold text-fuchsia-800">{message}</p>
      <p className="mt-2 text-xs font-medium text-fuchsia-700">{tooltip}</p>
      <Link
        href="/admin/company-setup"
        className="mt-6 inline-block rounded-xl bg-fuchsia-700 px-5 py-2.5 text-sm font-black text-white"
      >
        View package details
      </Link>
    </div>
  );
}
