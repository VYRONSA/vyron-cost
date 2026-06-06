import { ArrowRight, LucideIcon } from "lucide-react";
import Link from "next/link";

export default function ReportOptionCard({
  href,
  title,
  description,
  icon: Icon,
  badge,
  dark = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group block rounded-[2rem] p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] transition hover:-translate-y-1 hover:shadow-[0_22px_70px_rgba(168,85,247,0.16)] ${
        dark ? "bg-gradient-to-br from-violet-900 via-slate-950 to-fuchsia-900 text-white" : "border border-violet-100 bg-white text-slate-950"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={dark ? "rounded-2xl bg-white/10 p-3 text-fuchsia-200" : "rounded-2xl bg-violet-50 p-3 text-violet-700"}>
          <Icon size={24} />
        </div>

        <div className={dark ? "rounded-full bg-white/10 px-3 py-1 text-xs font-black text-fuchsia-200" : "rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700"}>
          {badge}
        </div>
      </div>

      <h3 className="mt-5 text-xl font-black">{title}</h3>
      <p className={dark ? "mt-3 text-sm font-semibold leading-7 text-slate-300" : "mt-3 text-sm font-semibold leading-7 text-slate-500"}>{description}</p>

      <div className={dark ? "mt-6 inline-flex items-center gap-2 text-sm font-black text-fuchsia-200" : "mt-6 inline-flex items-center gap-2 text-sm font-black text-violet-700"}>
        Open report
        <ArrowRight className="transition group-hover:translate-x-1" size={16} />
      </div>
    </Link>
  );
}
