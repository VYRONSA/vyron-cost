import { ArrowRight, LucideIcon } from "lucide-react";
import Link from "next/link";

export default function EnterpriseActionCard({
  href,
  title,
  text,
  icon: Icon,
  priority = "Normal",
}: {
  href: string;
  title: string;
  text: string;
  icon: LucideIcon;
  priority?: "Critical" | "High" | "Normal";
}) {
  const dark = priority === "Critical";

  return (
    <Link
      href={href}
      className={`group block rounded-[2rem] p-6 shadow-[0_14px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_65px_rgba(15,23,42,0.16)] ${
        dark ? "bg-[#07110d] text-white" : "border border-white bg-white/95 text-[#F8FAFC]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={
            dark
              ? "rounded-2xl bg-[#A3E635]/12 p-3 text-[#A3E635]"
              : "rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-3 text-[#65A30D]"
          }
        >
          <Icon size={24} />
        </div>

        <div
          className={
            priority === "Critical"
              ? "rounded-full bg-red-500/20 px-3 py-1 text-xs font-black text-red-300"
              : priority === "High"
                ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700"
                : "rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-1 text-xs font-black text-[#65A30D]"
          }
        >
          {priority}
        </div>
      </div>

      <h3 className="mt-5 text-xl font-black">{title}</h3>

      <p className={dark ? "mt-3 text-sm leading-7 text-slate-300" : "mt-3 text-sm leading-7 text-slate-500"}>
        {text}
      </p>

      <div className={dark ? "mt-6 inline-flex items-center gap-2 text-sm font-black text-[#A3E635]" : "mt-6 inline-flex items-center gap-2 text-sm font-black text-[#65A30D]"}>
        Open module
        <ArrowRight size={16} className="transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
