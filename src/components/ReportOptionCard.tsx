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
      className={`group block rounded-2xl border p-6 transition ${
        dark
          ? "border-white/10 vyron-grad-deep text-[#F8FAFC] shadow-[var(--vyron-elev-3)]"
          : "border-[rgba(11,32,43,0.07)] bg-white/72 text-[#0B202B] shadow-[var(--vyron-elev-2)] backdrop-blur-xl backdrop-saturate-150 hover:-translate-y-0.5 hover:border-[rgba(11,32,43,0.11)] hover:shadow-[var(--vyron-elev-3)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`rounded-xl p-3 ${
            dark
              ? "border border-white/15 bg-white/10 text-[#BCCDD5]"
              : "border border-[rgba(11,32,43,0.06)] bg-[rgba(22,58,72,0.06)] text-[#1F4757]"
          }`}
        >
          <Icon size={24} />
        </div>

        <div
          className={`rounded-full px-3 py-1 vyron-t-label text-[10px] ${
            dark
              ? "border border-white/15 bg-white/10 text-[#BCCDD5]"
              : "border border-[rgba(22,58,72,0.18)] bg-[rgba(22,58,72,0.06)] text-[#1F4757]"
          }`}
        >
          {badge}
        </div>
      </div>

      <h3 className={`mt-5 vyron-t-title text-xl ${dark ? "text-[#F8FAFC]" : "text-[#0B202B]"}`}>{title}</h3>
      <p className={`mt-3 vyron-t-body text-sm ${dark ? "text-[#CBD5E1]" : "text-[#334155]"}`}>{description}</p>

      <div className={`mt-6 inline-flex items-center gap-2 text-sm font-semibold ${dark ? "text-[#BCCDD5]" : "text-[#1F4757]"}`}>
        Open report
        <ArrowRight className="transition group-hover:translate-x-1" size={16} />
      </div>
    </Link>
  );
}
