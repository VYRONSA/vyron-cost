"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Layers, Sparkles } from "lucide-react";
import {
  PremiumMobileCard,
  PremiumMobileModuleTile,
  PremiumMobileRecordCard,
  PremiumMobileSearch,
} from "@/components/vyron-mobile/design-system";

type WorkspaceLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  eyebrow?: string;
};

type WorkspaceRecord = {
  id: string;
  title: string;
  subtitle: string;
  status: "draft" | "pending" | "approved" | "completed" | "archived" | "cancelled" | "received";
  icon: LucideIcon;
  meta: Array<{ label: string; value: string }>;
  href: string;
};

export default function VyronMobileModuleWorkspace({
  moduleName,
  summary,
  searchPlaceholder,
  recentSearches,
  links,
  records,
}: {
  moduleName: string;
  summary: string;
  searchPlaceholder: string;
  recentSearches: string[];
  links: WorkspaceLink[];
  records: WorkspaceRecord[];
}) {
  const visibleRecords = useMemo(() => records.slice(0, 5), [records]);

  return (
    <section className="space-y-5 px-4 pb-8 pt-1 sm:px-6">
      <PremiumMobileCard tone="default" className="p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{moduleName}</div>
        <div className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">Touch Workspace</div>
        <div className="mt-1 text-sm font-semibold text-slate-600">{summary}</div>
      </PremiumMobileCard>

      <PremiumMobileSearch placeholder={searchPlaceholder} recent={recentSearches} />

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Actions</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <PremiumMobileModuleTile
              key={`${moduleName}-${link.href}-${link.title}`}
              href={link.href}
              title={link.title}
              description={link.description}
              icon={link.icon}
              eyebrow={link.eyebrow || "Open"}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recent Activity</div>
        <div className="grid gap-3">
          {visibleRecords.map((record) => (
            <PremiumMobileRecordCard
              key={record.id}
              title={record.title}
              subtitle={record.subtitle}
              icon={record.icon}
              status={record.status}
              statusTone={record.status}
              meta={record.meta}
              actions={[
                { id: `${record.id}-open`, label: "Open", href: record.href, variant: "primary" },
              ]}
            />
          ))}

          {!visibleRecords.length ? (
            <PremiumMobileCard tone="muted" className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-700">
                  <Layers size={18} />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">No activity yet</div>
                  <div className="text-xs font-semibold text-slate-500">Use actions above to open this module’s workflows.</div>
                </div>
              </div>
            </PremiumMobileCard>
          ) : null}
        </div>
      </section>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#07111F] text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="text-sm font-black text-slate-950">Executive Focus</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Prioritize pending approvals, exceptions, and urgent records first for fastest operational impact.</div>
          </div>
        </div>
      </PremiumMobileCard>
    </section>
  );
}
