import { LucideIcon } from "lucide-react";
import VyronSurfaceCard from "@/components/VyronSurfaceCard";

export default function EnterpriseMetricCard({
  title,
  value,
  note,
  icon: Icon,
  dark = false,
}: {
  title: string;
  value: string;
  note: string;
  icon: LucideIcon;
  dark?: boolean;
}) {
  return (
    <VyronSurfaceCard elevated={dark} className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className={`rounded-2xl p-3 ${dark ? "vyron-grad-deep text-[#DDD6FE]" : "bg-[#F1F5F9] text-[#64748B]"}`}>
          <Icon size={23} />
        </div>
        <div className="rounded-full bg-[#F0FDF4] px-3 py-1 text-[10px] font-black text-[#9333EA]">LIVE</div>
      </div>
      <div className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[#64748B]">{title}</div>
      <div className="mt-2 text-3xl font-black tracking-tight text-[#0F172A]">{value}</div>
      <p className="mt-3 text-sm leading-6 text-[#64748B]">{note}</p>
    </VyronSurfaceCard>
  );
}
