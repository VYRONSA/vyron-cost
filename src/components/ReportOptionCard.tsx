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
      className={`group block rounded-2xl border p-6 shadow-[0_2px_16px_rgba(0,0,0,0.16)] transition hover:border-violet-400/25 ${
        dark
          ? "border-violet-400/25 bg-gradient-to-br from-[#1e1635] via-[#252040] to-[#1a1033] text-[#F8FAFC]"
          : "border-white/12 bg-[#252040] text-[#F8FAFC]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-violet-400/25 bg-violet-600/20 p-3 text-violet-200">
          <Icon size={24} />
        </div>

        <div className="rounded-full border border-violet-400/25 bg-violet-600/15 px-3 py-1 text-xs font-bold text-violet-200">
          {badge}
        </div>
      </div>

      <h3 className="mt-5 text-xl font-black text-[#F8FAFC]">{title}</h3>
      <p className="mt-3 text-sm font-medium leading-7 text-[#CBD5E1]">{description}</p>

      <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#A3E635]">
        Open report
        <ArrowRight className="transition group-hover:translate-x-1" size={16} />
      </div>
    </Link>
  );
}
