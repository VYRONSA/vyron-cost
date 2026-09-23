"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Box, Calculator, ChevronRight, ClipboardList, Coins, FileText, Package, TrendingUp, UserPlus } from "lucide-react";
import type { DashboardActivity, DashboardKpi, DashboardOverview } from "@/lib/vyron-dashboard-overview";

/**
 * The VOLORA executive dashboard.
 *
 * Deliberately short: a welcome, four things to do, four numbers, one trend,
 * what just happened. Nothing else belongs here — an executive screen earns
 * its place by what it leaves out.
 *
 * A figure that cannot be measured from the workspace's own records is left
 * blank rather than filled in, so nothing on this page is ever a guess.
 */

const QUICK_ACTIONS = [
  { title: "Calculate a Cost", subtitle: "Create or update a recipe", href: "/cost-calculator", icon: Calculator, tint: "#E9F6EE", ink: "#2F7D46", ring: "#CFE9D8" },
  { title: "Manage Inventory", subtitle: "View stock levels & movement", href: "/inventory", icon: Box, tint: "#EAF2FC", ink: "#2C6BB5", ring: "#D2E3F7" },
  { title: "View Orders", subtitle: "Track and fulfil orders", href: "/customer-sales-orders", icon: FileText, tint: "#FDF4E3", ink: "#B5822A", ring: "#F4E3C2" },
  { title: "View Reports", subtitle: "Get insights and analyse", href: "/reports", icon: TrendingUp, tint: "#F0EDFB", ink: "#5B4BA8", ring: "#DFD9F4" },
] as const;

const ACTIVITY_STYLE: Record<DashboardActivity["kind"], { icon: typeof Package; tint: string; ink: string }> = {
  order: { icon: Package, tint: "#E9F6EE", ink: "#2F7D46" },
  stock: { icon: Box, tint: "#EAF2FC", ink: "#2C6BB5" },
  recipe: { icon: ClipboardList, tint: "#F0EDFB", ink: "#5B4BA8" },
  customer: { icon: UserPlus, tint: "#FDF4E3", ink: "#B5822A" },
};

function money(value: number): string {
  return `R ${Math.round(value).toLocaleString("en-ZA").replace(/,/g, " ")}`;
}

/** "2 hours ago", "1 day ago" — the way the reference reads. */
function since(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function KpiChange({ kpi, unit }: { kpi: DashboardKpi; unit: "pct" | "abs" }) {
  const value = unit === "pct" ? kpi.changePct : kpi.changeAbs;
  // No comparable period, no claim.
  if (value === null || value === undefined) return <span className="mt-1.5 block text-[11px] font-medium text-[#94A3B8]">&nbsp;</span>;
  const up = value >= 0;
  return (
    <span className={`mt-1.5 flex items-center gap-1 text-[11px] font-bold ${up ? "text-[#2F7D46]" : "text-[#B4453C]"}`}>
      <ArrowUpRight size={12} className={up ? "" : "rotate-90"} aria-hidden />
      {up ? "+" : ""}
      {value}
      {unit === "pct" ? "%" : ""}
      <span className="font-medium text-[#94A3B8]">vs last month</span>
    </span>
  );
}

function Kpi({ icon: Icon, label, display, kpi, unit }: { icon: typeof Coins; label: string; display: string; kpi: DashboardKpi; unit: "pct" | "abs" }) {
  return (
    <div className="min-w-0">
      <Icon size={22} className="text-[#334155]" aria-hidden />
      <p className="mt-3 truncate text-[13px] font-medium text-[#64748B]">{label}</p>
      <p className="mt-1 text-[1.6rem] font-black leading-none tracking-[-0.02em] text-[#2F7D46]">{display}</p>
      <KpiChange kpi={kpi} unit={unit} />
    </div>
  );
}

/** The gross-profit trend, drawn from measured monthly figures only. */
function GpTrend({ points }: { points: DashboardOverview["gpTrend"] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] text-sm font-semibold text-[#94A3B8]">
        Not enough invoiced months to show a trend yet
      </div>
    );
  }
  const width = 560;
  const height = 150;
  const padX = 34;
  const padY = 16;
  const max = Math.max(50, Math.ceil(Math.max(...points.map((p) => p.gpPct)) / 10) * 10);
  const x = (i: number) => padX + (i * (width - padX - 12)) / Math.max(1, points.length - 1);
  const y = (v: number) => padY + (height - padY * 2) * (1 - v / max);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.gpPct).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - padY} L${x(0).toFixed(1)},${height - padY} Z`;
  const ticks = [0, max / 5, (max / 5) * 2, (max / 5) * 3, (max / 5) * 4, max];

  return (
    <svg viewBox={`0 0 ${width} ${height + 22}`} className="h-[172px] w-full" role="img" aria-label="Gross profit percentage by month">
      <defs>
        <linearGradient id="volora-gp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3E9B52" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3E9B52" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padX} x2={width - 12} y1={y(t)} y2={y(t)} stroke="#EEF2F6" strokeWidth="1" />
          <text x={padX - 8} y={y(t) + 3} textAnchor="end" className="fill-[#94A3B8] text-[9px] font-semibold">
            {Math.round(t)}%
          </text>
        </g>
      ))}
      <path d={area} fill="url(#volora-gp-fill)" />
      <path d={line} fill="none" stroke="#3E9B52" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={p.month} cx={x(i)} cy={y(p.gpPct)} r="3.6" fill="#3E9B52" stroke="#FFFFFF" strokeWidth="1.6" />
      ))}
      {points.map((p, i) => (
        <text key={`${p.month}-label`} x={x(i)} y={height + 14} textAnchor="middle" className="fill-[#94A3B8] text-[10px] font-semibold">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

export default function DashboardExecutiveClient({ overview }: { overview: DashboardOverview }) {
  const { totalCostValue, averageGpPct, activeProducts, ordersThisMonth, gpTrend, gpTrendChangePct, activity } = overview;

  return (
    <div className="grid w-full max-w-full min-w-0 gap-5">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden rounded-2xl bg-[#0A1C17]">
        <Image
          src="/volora/dashboard/hero-production.webp"
          alt=""
          width={1430}
          height={578}
          priority
          className="absolute inset-y-0 right-0 h-full w-full object-cover object-right md:w-[62%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,28,23,1)_0%,rgba(10,28,23,1)_39%,rgba(10,28,23,0.55)_50%,rgba(10,28,23,0.15)_60%,rgba(10,28,23,0)_68%)] max-md:bg-[linear-gradient(90deg,rgba(10,28,23,0.95)_0%,rgba(10,28,23,0.78)_60%,rgba(10,28,23,0.35)_100%)]" />
        <div className="relative px-8 py-9 md:px-10 md:py-11">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#F4C44E]">Welcome to VOLORA</p>
          <h1 className="mt-4 max-w-xl text-[2.35rem] font-black leading-[1.08] tracking-[-0.025em] text-white md:text-[2.75rem]">
            Turn insight into
            <br />
            <span className="text-[#F4C44E]">profitable</span> decisions.
          </h1>
          <p className="mt-4 max-w-md text-[0.95rem] font-medium leading-6 text-[#DDE7EB]">
            Real-time cost, margin and operational intelligence for a stronger, more profitable food business.
          </p>
          <div className="mt-6 flex items-center gap-4">
            <span className="h-[3px] w-11 rounded-full bg-[#F4C44E]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#C7D5DB]">
              Know your numbers. Grow your possibilities.
            </span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- quick actions */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_ACTIONS.map(({ title, subtitle, href, icon: Icon, tint, ink, ring }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-[#E8EDF2] bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:border-[#CBD5E1] hover:shadow-[0_10px_30px_-18px_rgba(11,32,43,0.45)]"
            style={{ backgroundColor: tint, borderColor: ring }}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80" style={{ color: ink }}>
                <Icon size={20} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.95rem] font-black text-[#0B202B]">{title}</span>
                <span className="block truncate text-xs font-medium text-[#64748B]">{subtitle}</span>
              </span>
            </span>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition group-hover:translate-x-0.5"
              style={{ borderColor: ink, color: ink }}
            >
              <ArrowRight size={15} aria-hidden />
            </span>
          </Link>
        ))}
      </section>

      {/* ------------------------------------- key performance + profit trend */}
      <section className="grid gap-5 xl:grid-cols-[1.02fr_1fr]">
        <div className="rounded-2xl border border-[#E8EDF2] bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.05rem] font-black tracking-[-0.01em] text-[#0B202B]">Key Performance</h2>
            <span className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-[#475569]">This Month</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 lg:grid-cols-4">
            <Kpi icon={Coins} label="Total Cost Value" display={totalCostValue.value === null ? "—" : money(totalCostValue.value)} kpi={totalCostValue} unit="pct" />
            <Kpi icon={TrendingUp} label="Average GP" display={averageGpPct.value === null ? "—" : `${averageGpPct.value}%`} kpi={averageGpPct} unit="pct" />
            <Kpi icon={Box} label="Active Products" display={activeProducts.value === null ? "—" : String(activeProducts.value)} kpi={activeProducts} unit="abs" />
            <Kpi icon={ClipboardList} label="Orders (This Month)" display={ordersThisMonth.value === null ? "—" : String(ordersThisMonth.value)} kpi={ordersThisMonth} unit="pct" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8EDF2] bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.05rem] font-black tracking-[-0.01em] text-[#0B202B]">Gross Profit Trend</h2>
            <span className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-[#475569]">Last 6 Months</span>
          </div>
          <div className="mt-4">
            <GpTrend points={gpTrend} />
          </div>
          {gpTrendChangePct !== null ? (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#EFF7F1] px-4 py-3">
              <TrendingUp size={17} className="mt-0.5 shrink-0 text-[#2F7D46]" aria-hidden />
              <p className="text-[13px] font-semibold leading-5 text-[#25543A]">
                Your gross profit is {gpTrendChangePct >= 0 ? "up" : "down"} {Math.abs(gpTrendChangePct)}% compared to 3 months ago.
                {gpTrendChangePct >= 0 ? <span className="block font-medium">Keep up the great work!</span> : null}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* --------------------------------------------- recent activity + quote */}
      <section className="grid gap-5 xl:grid-cols-[1.02fr_1fr]">
        <div className="rounded-2xl border border-[#E8EDF2] bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.05rem] font-black tracking-[-0.01em] text-[#0B202B]">Recent Activity</h2>
            <Link href="/audit-logs" className="flex items-center gap-1.5 text-xs font-bold text-[#2F7D46] hover:underline">
              View All <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
          {activity.length ? (
            <ul className="mt-3 divide-y divide-[#F1F5F9]">
              {activity.map((row) => {
                const style = ACTIVITY_STYLE[row.kind];
                const Icon = style.icon;
                return (
                  <li key={`${row.kind}-${row.at}-${row.detail}`}>
                    <Link href={row.href} className="flex items-center gap-3 py-3.5 transition hover:opacity-80">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: style.tint, color: style.ink }}>
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9rem] font-bold text-[#0B202B]">{row.title}</span>
                      </span>
                      <span className="hidden min-w-0 max-w-[12rem] truncate text-[0.85rem] font-medium text-[#64748B] sm:block">{row.detail}</span>
                      <span className="shrink-0 text-xs font-medium text-[#94A3B8]">{since(row.at)}</span>
                      <ChevronRight size={15} className="shrink-0 text-[#CBD5E1]" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-6 text-sm font-semibold text-[#94A3B8]">Nothing has happened in this workspace yet.</p>
          )}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[#E8EDF2] bg-[#F7F9F8] p-7">
          <Image
            src="/volora/dashboard/quote-leaf.webp"
            alt=""
            width={360}
            height={456}
            className="pointer-events-none absolute bottom-0 right-1 h-40 w-auto"
          />
          <p className="text-[2.6rem] font-black leading-none text-[#CFE0D6]" aria-hidden>
            &ldquo;
          </p>
          <p className="relative mt-2 max-w-sm text-[1.05rem] font-bold italic leading-7 text-[#243B33]">
            Better data. Better food. A more profitable tomorrow.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <span className="h-[3px] w-9 rounded-full bg-[#F4C44E]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#7C8B84]">VOLORA</span>
          </div>
        </div>
      </section>
    </div>
  );
}
