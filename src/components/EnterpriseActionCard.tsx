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
      className={`group block rounded-[2rem] p-6 shadow-[0_14px_45px_rgba(11,32,43,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_65px_rgba(11,32,43,0.16)] ${
        dark ? "bg-[#061722] text-white" : "border border-white bg-white/95 text-[#F8FAFC]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={
            dark
              ? "rounded-2xl bg-[#2C5A6B]/12 p-3 text-[#2C5A6B]"
              : "rounded-2xl border border-[#2C5A6B]/20 bg-[#2C5A6B]/10 p-3 text-[#163A48]"
          }
        >
          <Icon size={24} />
        </div>

        <div
          className={
            priority === "Critical"
              ? "rounded-full bg-red-500/20 px-3 py-1 text-xs font-black text-red-300"
              : priority === "High"
                ? "rounded-full bg-[var(--vyron-warning-bg)] px-3 py-1 text-xs font-black text-[var(--vyron-warning-fg)]"
                : "rounded-full border border-[#2C5A6B]/25 bg-[#2C5A6B]/10 px-3 py-1 text-xs font-black text-[#163A48]"
          }
        >
          {priority}
        </div>
      </div>

      <h3 className="mt-5 text-xl font-black">{title}</h3>

      <p className={dark ? "mt-3 text-sm leading-7 text-slate-300" : "mt-3 text-sm leading-7 text-slate-500"}>
        {text}
      </p>

      <div className={dark ? "mt-6 inline-flex items-center gap-2 text-sm font-black text-[#2C5A6B]" : "mt-6 inline-flex items-center gap-2 text-sm font-black text-[#163A48]"}>
        Open module
        <ArrowRight size={16} className="transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
