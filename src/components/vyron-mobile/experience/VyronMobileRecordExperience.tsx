"use client";

import type { ReactNode } from "react";
import {
  PremiumMobileCard,
  PremiumMobileStatusBadge,
} from "@/components/vyron-mobile/design-system";
import type { MobileStatusTone } from "@/components/vyron-mobile/design-system";

export default function VyronMobileRecordExperience({
  title,
  subtitle,
  status,
  tone,
  timeline,
  children,
}: {
  title: string;
  subtitle?: string;
  status: string;
  tone: MobileStatusTone;
  timeline: Array<{ id: string; label: string; detail: string }>;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 px-4 pb-8 pt-1 sm:px-5">
      <PremiumMobileCard tone="raised" className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Record Workspace</div>
            <div className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">{title}</div>
            {subtitle ? <div className="mt-2 text-sm font-semibold text-slate-600">{subtitle}</div> : null}
          </div>
          <PremiumMobileStatusBadge label={status} tone={tone} />
        </div>
      </PremiumMobileCard>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Timeline</div>
        <div className="mt-3 space-y-3">
          {timeline.map((step, index) => (
            <div key={step.id} className="relative pl-7">
              <span className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${index === 0 ? "bg-[#C79A2B]" : "bg-slate-300"}`} />
              {index < timeline.length - 1 ? <span className="absolute left-[5px] top-4 h-8 w-[2px] bg-slate-200" /> : null}
              <div className="text-sm font-black text-slate-900">{step.label}</div>
              <div className="text-xs font-semibold text-slate-500">{step.detail}</div>
            </div>
          ))}
        </div>
      </PremiumMobileCard>

      <PremiumMobileCard tone="default" className="p-3">
        {children}
      </PremiumMobileCard>
    </section>
  );
}
