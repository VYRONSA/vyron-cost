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
      className="inline-flex items-center gap-2 rounded-full bg-[#07110d] px-5 py-3 text-sm font-black text-emerald-300 shadow-lg shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-emerald-950"
    >
      <Icon size={16} />
      {label}
      <ArrowRight size={16} />
    </Link>
  );
}
