import { ArrowRight, LucideIcon } from "lucide-react";
import Link from "next/link";

export default function QuickActionLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-3 text-sm font-semibold text-[#F8FAFC] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#2a2448]"
    >
      <Icon size={16} />
      {label}
      <ArrowRight size={16} />
    </Link>
  );
}
