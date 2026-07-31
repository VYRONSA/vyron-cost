import {
  Bell,
  Box,
  ClipboardList,
  Grid3X3,
  LineChart,
  Package,
  Search,
  Target,
  TrendingUp,
  Truck,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import VyronCostSidebar from "@/components/VyronCostSidebar";
import { DashboardProductCard, getDashboardProducts } from "@/lib/vyron-cost-ui-adapters";

const recommendations = [
  { title: "Review Low GP Products", value: "R48,400", sub: "Annual profit impact", color: "green", icon: TrendingUp, href: "/price-optimizer" },
  { title: "Check Supplier Movement", value: "R21,100", sub: "Annual saving", color: "orange", icon: Truck, href: "/supplier-intelligence" },
  { title: "Reduce Packaging Cost", value: "R18,900", sub: "Annual saving", color: "purple", icon: Package, href: "/recovery-opportunities" },
];

function TopBar() {
  return (
    <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[#111827] md:text-4xl">
          PROFIT COMMAND CENTRE
        </h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Real-time cost intelligence. Smarter decisions. Maximum profit.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Link href="/ai-assistant" className="flex h-12 w-[430px] max-w-full items-center gap-3 rounded-2xl border border-violet-100 bg-white px-4 shadow-sm">
          <Search size={18} className="text-violet-500" />
          <span className="text-sm font-semibold text-slate-400">Ask VYRON AI anything...</span>
          <WandSparkles size={17} className="ml-auto text-violet-500" />
        </Link>

        <Link href="/alerts" className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Bell size={20} />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full vyron-grad-surface text-[10px] font-semibold text-white">
            3
          </span>
        </Link>

        <Link href="/reports" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Grid3X3 size={19} />
        </Link>
      </div>
    </header>
  );
}

function HeroPanel() {
  return (
    <Link href="/executive-briefing" className="relative mb-5 block overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4d2aa8] via-[#524dd2] to-[#101f5a] p-7 text-white shadow-[0_24px_70px_rgba(88,80,214,0.35)]">
      <div className="absolute inset-0 opacity-80">
        <div className="absolute -bottom-12 -left-10 h-48 w-[900px] rounded-[50%] bg-gradient-to-r from-fuchsia-500 to-[var(--vyron-warning-bg)] to-blue-400 blur-2xl" />
        <div className="absolute right-16 top-5 h-52 w-52 rounded-full border-[18px] border-[var(--vyron-warning-border)] shadow-[0_0_55px_rgba(255,119,44,0.8)]" />
      </div>

      <div className="relative z-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="text-sm font-black uppercase tracking-[0.14em]">Today · Handcrafted Food Products</span>
          <span className="rounded-full border border-[#A855F7]/25 bg-[#A855F7]/100 px-3 py-1 text-xs font-black">LIVE</span>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1fr_1fr_1fr_0.9fr] xl:items-center">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-100">Total Revenue</div>
            <div className="mt-4 text-4xl font-black">R1,847,220</div>
            <div className="mt-4 inline-flex rounded-full bg-white/14 px-4 py-2 text-sm font-black">↑ 8.6% vs yesterday</div>
          </div>

          <div className="border-white/20 xl:border-l xl:pl-10">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-100">Gross Profit</div>
            <div className="mt-4 text-5xl font-black">73.8%</div>
            <div className="mt-4 inline-flex rounded-full bg-white/14 px-4 py-2 text-sm font-black">↑ 4.6% vs yesterday</div>
          </div>

          <div className="border-white/20 xl:border-l xl:pl-10">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-100">Profit Generated</div>
            <div className="mt-4 text-4xl font-black">R1,361,244</div>
            <div className="mt-4 inline-flex rounded-full bg-white/14 px-4 py-2 text-sm font-black">↑ R148,220 vs last month</div>
          </div>

          <div className="flex justify-center xl:justify-end">
            <div className="relative flex h-44 w-44 items-center justify-center rounded-full border-[18px] border-[var(--vyron-warning-border)] bg-white/10 shadow-[0_0_50px_rgba(255,113,44,0.65)]">
              <div className="text-center">
                <Target className="mx-auto mb-1" size={22} />
                <div className="text-xs font-black uppercase">GP Target</div>
                <div className="text-4xl font-black">70%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ProductProfitMap({ products }: { products: DashboardProductCard[] }) {
  return (
    <section className="mb-5 rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">HANDCRAFTED PROFIT MAP</h2>
          <p className="text-xs font-semibold text-slate-500">Client demo view: pies, pastry, sausage rolls and production items only.</p>
        </div>

        <Link href="/product-profitability" className="rounded-xl bg-violet-50 px-4 py-2 text-xs font-black text-violet-700">
          View full product intelligence →
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.id}`}
            className={`relative block overflow-hidden rounded-3xl border p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
              p.tone === "green"
                ? "border-[#A855F7]/25 bg-gradient-to-br from-white to-[#A855F7]/10"
                : p.tone === "blue"
                  ? "border-blue-200 bg-gradient-to-br from-white to-blue-50"
                  : p.tone === "amber"
                    ? "border-[var(--vyron-warning-border)] bg-gradient-to-br from-white to-[var(--vyron-warning-bg)]"
                    : "border-red-200 bg-gradient-to-br from-white to-red-50"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-4xl shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                {p.emoji}
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  p.tone === "green"
                    ? "bg-[#A855F7]/12 text-[#7E22CE]"
                    : p.tone === "blue"
                      ? "bg-blue-100 text-blue-700"
                      : p.tone === "amber"
                        ? "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]"
                        : "bg-red-100 text-red-700"
                }`}
              >
                {p.badge}
              </div>
            </div>

            <div className="min-h-[48px] text-base font-black leading-tight text-slate-900">{p.name}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">{p.category}</div>

            <div
              className={`mt-5 text-5xl font-black tracking-tight ${
                p.tone === "green"
                  ? "text-[#7E22CE]"
                  : p.tone === "blue"
                    ? "text-blue-700"
                    : p.tone === "amber"
                      ? "text-[var(--vyron-warning-fg)]"
                      : "text-red-700"
              }`}
            >
              {p.gp}%
            </div>
            <div className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Gross Profit</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function AiAssistant() {
  return (
    <section className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-[0.15em] text-violet-700">VYRON AI Assistant</div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">BETA</span>
      </div>

      <h2 className="text-2xl font-black text-slate-900">What should I do today?</h2>
      <p className="mt-2 text-sm font-semibold text-slate-500">AI analysed your business in real-time.</p>

      <div className="mt-5 space-y-4">
        {recommendations.map((item) => {
          const Icon = item.icon;
          const bg = item.color === "green" ? "bg-[#A855F7]/100" : item.color === "orange" ? "bg-[var(--vyron-warning-solid)]" : "bg-violet-600";

          return (
            <Link key={item.title} href={item.href} className="flex items-center gap-4 rounded-3xl bg-slate-50 p-4 transition hover:bg-violet-50">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${bg} text-white shadow-lg`}>
                <Icon size={28} />
              </div>
              <div className="flex-1">
                <div className="font-black text-slate-900">{item.title}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{item.sub}</div>
                <div className={`mt-1 text-2xl font-black ${item.color === "green" ? "text-[#84CC16]" : item.color === "orange" ? "text-[var(--vyron-warning-fg)]" : "text-violet-600"}`}>
                  {item.value}
                </div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">→</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function BottomKpis() {
  const items = [
    ["DEMO PRODUCTS", "Pie Range", "Client-specific view", Box, "/products"],
    ["AVG GROSS PROFIT", "63.7%", "This month", TrendingUp, "/financial-intelligence"],
    ["COST OF GOODS SOLD", "R666,120", "This month", ClipboardList, "/cost-analysis"],
    ["FORECASTED GP", "R1,425,000", "Next 30 days", Target, "/forecasting"],
    ["NET PROFIT MARGIN", "32.6%", "This month", LineChart, "/reports"],
  ];

  return (
    <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {items.map(([title, value, sub, Icon, href]) => (
        <Link key={title as string} href={href as string} className="rounded-[1.6rem] bg-white p-5 shadow-[0_14px_35px_rgba(81,63,190,0.08)] transition hover:-translate-y-1 hover:shadow-xl">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
            <Icon size={23} />
          </div>
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{title as string}</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{value as string}</div>
          <div className="mt-1 text-xs font-bold text-slate-500">{sub as string}</div>
        </Link>
      ))}
    </section>
  );
}

export default async function VyronCostAiStyleDashboard() {
  const products = await getDashboardProducts(5);

  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#0F172A]">
      <div className="flex">
        <VyronCostSidebar />

        <section className="relative flex min-h-screen flex-1 flex-col">
          <div className="relative z-10 flex flex-1 flex-col p-3 lg:p-4">
            <div className="mx-auto w-full max-w-[1680px] px-2 py-2">
          <TopBar />

          <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
            <div>
              <HeroPanel />
              <ProductProfitMap products={products} />

              <div className="grid gap-5 xl:grid-cols-3">
                <Link href="/financial-intelligence" className="block rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:-translate-y-1 hover:shadow-xl">
                  <h2 className="text-base font-black text-slate-900">PROFIT TREND</h2>
                  <p className="text-xs font-semibold text-slate-500">Gross Profit % over time</p>
                  <div className="mt-4 text-3xl font-black text-violet-700">73.8%</div>
                  <div className="mt-5 h-44 rounded-2xl bg-gradient-to-b from-violet-50 to-white p-4">
                    <svg viewBox="0 0 360 150" className="h-full w-full">
                      <polyline fill="none" stroke="#5b35d5" strokeWidth="4" points="0,120 40,100 80,95 120,70 160,55 200,75 240,58 280,42 320,50 360,25" />
                      <circle cx="360" cy="25" r="7" fill="#2563eb" />
                    </svg>
                  </div>
                </Link>

                <Link href="/product-profitability" className="block rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:-translate-y-1 hover:shadow-xl">
                  <h2 className="text-base font-black text-slate-900">TOP PROFIT DRIVERS</h2>
                  <div className="mt-5 space-y-3">
                    {products.slice(0, 5).map((product) => (
                      <div key={product.id} className="flex items-center justify-between">
                        <span className="font-black">{product.name}</span>
                        <span className="font-black text-[#84CC16]">{product.gp}%</span>
                      </div>
                    ))}
                  </div>
                </Link>

                <Link href="/threat-centre" className="block rounded-[2rem] bg-red-50 p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:-translate-y-1 hover:shadow-xl">
                  <h2 className="text-base font-black text-red-700">TOP PROFIT LEAKS</h2>
                  <div className="mt-5 space-y-3">
                    {products.slice().reverse().slice(0, 5).map((product) => (
                      <div key={product.id} className="flex items-center justify-between">
                        <span className="font-black">{product.name}</span>
                        <span className="font-black text-red-600">{product.gp}%</span>
                      </div>
                    ))}
                  </div>
                </Link>
              </div>
            </div>

            <div className="space-y-5">
              <AiAssistant />
              <Link href="/procurement-risk" className="block rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:-translate-y-1 hover:shadow-xl">
                <h2 className="text-base font-black text-slate-900">COST RISK RADAR</h2>
                <div className="mt-5 flex h-36 items-center justify-center rounded-3xl bg-violet-50">
                  <div className="h-28 w-28 rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-500 to-[var(--vyron-warning-bg)] opacity-85" />
                </div>
                <div className="mt-4 text-sm font-black text-violet-700">Open procurement risk →</div>
              </Link>
              <Link href="/supplier-intelligence" className="block rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:-translate-y-1 hover:shadow-xl">
                <h2 className="text-base font-black text-slate-900">SUPPLIER PERFORMANCE</h2>
                <div className="mt-5 text-sm font-black text-violet-700">Open supplier intelligence →</div>
              </Link>
            </div>
          </div>

          <BottomKpis />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
