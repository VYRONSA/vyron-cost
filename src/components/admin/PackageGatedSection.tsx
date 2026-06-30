"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { VyronSectionHeader } from "@/components/vyron-ui";
import {
  getFeatureTooltip,
  getUpgradePackageLabel,
  hasFeature,
  isPremiumLocked,
  type FeatureKey,
} from "@/lib/vyron-package-manager";

export default function PackageGatedSection({
  packageName,
  feature,
  title,
  children,
}: {
  packageName: string;
  feature: FeatureKey;
  title: string;
  children: ReactNode;
}) {
  const locked = isPremiumLocked(packageName, feature);
  const enabled = hasFeature(packageName, feature);

  if (enabled) {
    return <section>{children}</section>;
  }

  return (
    <section className="opacity-70">
      <VyronSectionHeader title={title} />
      <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6">
        <div className="text-sm font-bold text-[#64748B]">{getFeatureTooltip(feature)}</div>
        <p className="mt-2 text-xs font-medium text-[#94A3B8]">
          Upgrade to {getUpgradePackageLabel(feature)} to unlock live {title.toLowerCase()} widgets.
        </p>
        <Link href="/admin/company-setup" className="mt-4 inline-flex text-sm font-bold text-[#7C3AED]">
          View upgrade options →
        </Link>
      </div>
      {locked ? null : children}
    </section>
  );
}
