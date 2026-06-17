import Link from "next/link";

const links = [
  ["/vyron-core/command-centre", "Executive Command Centre"],
  ["/vyron-core/forecasting", "Forecasting"],
  ["/vyron-core/simulations", "Simulation Engine"],
] as const;

export default function VyronCoreNav() {
  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black hover:bg-violet-50">
          {label}
        </Link>
      ))}
    </nav>
  );
}
