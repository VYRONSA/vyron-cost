import { ArrowUpRight, LucideIcon } from "lucide-react";

export default function MetricCard({
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
    <div className={`rounded-[2rem] p-5 shadow-[0_10px_40px_rgba(11,32,43,0.06)] ${dark ? "bg-[#081c27] text-white" : "border border-white bg-white text-slate-950"}`}>
      <div className="flex items-start justify-between">
        <div className={dark ? "rounded-2xl bg-white/10 p-3" : "rounded-2xl bg-[#2C5A6B]/10 p-3"}>
          <Icon className={dark ? "text-[#2C5A6B]" : "text-[#55B968]"} size={22} />
        </div>
        <ArrowUpRight className={dark ? "text-white/30" : "text-slate-300"} size={18} />
      </div>
      <div className={dark ? "mt-5 text-sm font-bold text-slate-300" : "mt-5 text-sm font-bold text-slate-500"}>{title}</div>
      <div className="mt-2 text-4xl font-black">{value}</div>
      <div className={dark ? "mt-2 text-sm font-bold text-[#2C5A6B]" : "mt-2 text-sm font-bold text-[#55B968]"}>{note}</div>
    </div>
  );
}
