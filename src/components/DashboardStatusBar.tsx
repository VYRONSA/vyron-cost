import { Activity, Bell, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { formatCompactAnnual, formatExecutiveMoney } from "@/components/VyronSurfaceCard";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

export default function DashboardStatusBar({ kpis }: { kpis: LeakageKpis }) {
  const items = [
    { label: "Money At Risk", value: formatExecutiveMoney(kpis.moneyAtRisk), tone: "text-[#EF4444]" },
    { label: "Recoverable / Year", value: formatCompactAnnual(kpis.recoverableAnnual), tone: "text-[#9333EA]" },
    { label: "Active Actions", value: String(kpis.pendingActions), tone: "text-[#C026D3]" },
    { label: "Recovery Rate", value: `${kpis.recoveryRatePercent}%`, tone: "text-[#0F172A]" },
    { label: "Threat Signals", value: "5", tone: "text-[#EF4444]" },
  ];

  return (
    <footer className="sticky bottom-0 z-10 mt-3 border-t border-[#E2E8F0] bg-white/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-4 px-1 py-3">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B]">
          <Activity size={14} className="text-[#9333EA]" />
          Live Status
        </div>
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#64748B]">{item.label}</span>
            <span className={`text-sm font-black ${item.tone}`}>{item.value}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/alerts" className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#64748B] hover:text-[#0F172A]">
            <Bell size={12} />
            Alerts
          </Link>
          <Link href="/action-centre" className="inline-flex items-center gap-1 rounded-lg bg-[#08111A] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-white">
            <ShieldCheck size={12} />
            Actions
          </Link>
        </div>
      </div>
    </footer>
  );
}
