import { ArrowUpRight, LucideIcon } from "lucide-react";
import Link from "next/link";

export default function ModuleCard({
  href,
  title,
  text,
  icon: Icon,
  dark = false,
}: {
  href: string;
  title: string;
  text: string;
  icon: LucideIcon;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block cursor-pointer rounded-[2rem] p-6 shadow-[0_10px_40px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:shadow-[0_18px_55px_rgba(15,23,42,0.14)] ${
        dark
          ? "bg-[#07110d] text-white"
          : "border border-white bg-white text-slate-950"
      }`}
    >
      <div className="flex items-start justify-between">
        <div
          className={
            dark
              ? "rounded-2xl bg-[#A3E635]/12 p-3 text-[#A3E635]"
              : "rounded-2xl bg-[#A3E635]/10 p-3 text-[#65A30D]"
          }
        >
          <Icon size={22} />
        </div>

        <ArrowUpRight
          className={dark ? "text-[#A3E635]" : "text-[#84CC16]"}
          size={20}
        />
      </div>

      <h3 className="mt-5 text-xl font-black">{title}</h3>

      <p
        className={`mt-3 text-sm leading-7 ${
          dark ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {text}
      </p>
    </Link>
  );
}
