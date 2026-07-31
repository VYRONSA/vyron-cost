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
  stripe = false,
}: {
  packageName: string;
  feature: FeatureKey;
  title: string;
  children: ReactNode;
  /** Paints this band's cards in brand blue — see `.vyron-band-blue` in globals.css */
  stripe?: boolean;
}) {
  const locked = isPremiumLocked(packageName, feature);
  const enabled = hasFeature(packageName, feature);
  const band = stripe ? "vyron-band-blue" : "";

  if (enabled) {
    return <section className={band || undefined}>{children}</section>;
  }

  return (
    <section className={`opacity-70 ${band}`.trim()}>
      <VyronSectionHeader title={title} />
      <div className="vyron-upgrade-panel rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6">
        <div className="text-sm font-bold text-[#64748B]">{getFeatureTooltip(feature)}</div>
        <p className="mt-2 text-xs font-medium text-[#94A3B8]">
          Upgrade to {getUpgradePackageLabel(feature)} to unlock live {title.toLowerCase()} widgets.
        </p>
        <Link href="/admin/company-setup" className="mt-4 inline-flex text-sm font-bold text-[#1D6BFF]">
          View upgrade options →
        </Link>
      </div>
      {locked ? null : children}
    </section>
  );
}
