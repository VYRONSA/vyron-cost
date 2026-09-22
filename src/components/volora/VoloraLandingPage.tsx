import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  ChartColumnIncreasing,
  Check,
  Coins,
  Croissant,
  CupSoda,
  Factory,
  FlaskConical,
  Leaf,
  Package,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import { VoloraWordmark } from "@/components/vyron-ui/VyronLogo";

/**
 * VOLORA public landing page.
 *
 * Built to the approved design reference (docs/brand/volora-landing-reference.png,
 * 1024 x 1536). On desktop every measurement is expressed in `--u`, where
 * 1u = 1/100 of the page width (capped at 16px), so 1u equals 10.24px of the
 * reference and the composition scales exactly like the design.
 *
 * Photography is extracted from the reference itself
 * (scripts/extract-volora-landing-assets.mjs). The laptop and phone show real
 * VOLORA screens captured from the demo workspace (dashboard; mobile Manufacturing —
 * the app has no separate "Live Production" screen). The four hero KPI figures are
 * illustrative marketing figures and are labelled as such.
 */

const A = "/volora/landing";
const u = (n: number) => `calc(var(--u) * ${n})`;

const NAV = [
  { label: "Platform", href: "#platform" },
  { label: "Solutions", href: "#solutions" },
  { label: "Industries", href: "#industries" },
  { label: "Resources", href: "#resources" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "#about" },
];

const KPIS = [
  { label: "Gross Margin", value: "28.4%", delta: "2.6%", up: true, mark: "bars" },
  { label: "Cost Variance", value: "-6.8%", delta: "4.1%", up: false, mark: "line" },
  { label: "Production Yield", value: "96.2%", delta: "1.9%", up: true, mark: "bars" },
  { label: "Waste Reduction", value: "-18.5%", delta: "8.3%", up: false, mark: "leaf" },
] as const;

const BENEFITS = [
  { icon: Coins, title: "Control Costs", body: "Full visibility from raw material to finished goods." },
  { icon: Settings, title: "Reduce Waste", body: "Find and eliminate hidden costs." },
  { icon: ChartColumnIncreasing, title: "Improve Margins", body: "Turn data into actionable insights." },
  { icon: ShieldCheck, title: "Ensure Compliance", body: "Meet food safety and industry standards." },
  { icon: Users, title: "Empower Teams", body: "Give people the tools to make a difference." },
  { icon: Leaf, title: "Build a Stronger Future", body: "Sustainable, profitable growth for your business." },
];

const CHECKLIST = [
  "Cost and margin intelligence",
  "Recipe and BOM costing",
  "Inventory and procurement control",
  "Production and yield analysis",
  "Waste and variance tracking",
  "Customer and product profitability",
  "Xero integration",
  "AI-powered insights and recommendations",
];

const INDUSTRIES = [
  { slug: "general-manufacturing", label: ["General", "Manufacturing"], icon: Factory },
  { slug: "food-manufacturing", label: ["Food", "Manufacturing"], icon: Croissant },
  { slug: "beverages", label: ["Beverages"], icon: CupSoda },
  { slug: "packaging", label: ["Packaging"], icon: Package },
  { slug: "chemicals", label: ["Chemicals"], icon: FlaskConical },
  { slug: "distribution", label: ["Distribution"], icon: Warehouse },
  { slug: "multi-site-operations", label: ["Multi-site", "Operations"], icon: Building2 },
];

/* ─────────────────────────────── primitives ─────────────────────────────── */

function GoldButton({ href, children, className = "", style }: { href: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <Link
      href={href}
      style={style}
      className={`inline-flex items-center justify-center gap-[0.6em] rounded-full bg-[linear-gradient(180deg,#F7C948_0%,#E8B83F_100%)] font-semibold text-[#061722] shadow-[0_8px_24px_rgba(232,184,63,0.28)] transition hover:brightness-105 ${className}`}
    >
      {children}
    </Link>
  );
}

function MiniBars() {
  return (
    <svg viewBox="0 0 24 20" className="h-full w-full" aria-hidden>
      {[3, 7, 11, 15, 19].map((x, i) => (
        <rect key={x} x={x - 1.6} y={18 - (i + 1) * 3.2} width="3.2" height={(i + 1) * 3.2} rx="0.6" fill={i === 4 ? "#82CA8F" : "#55B968"} />
      ))}
    </svg>
  );
}

function MiniLine() {
  return (
    <svg viewBox="0 0 40 20" className="h-full w-full" fill="none" aria-hidden>
      <path d="M2 16 L11 10 L17 13 L26 6 L31 9 L38 3" stroke="#55B968" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {[[11, 10], [26, 6], [38, 3]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="1.6" fill="#55B968" />
      ))}
    </svg>
  );
}

/** Hero KPI card. Sizes are in container units of the hero photo, so the card
    stays locked to the photograph at every width. */
function KpiCard({ k }: { k: (typeof KPIS)[number] }) {
  const Delta = k.up ? ArrowUp : ArrowDown;
  return (
    <div className="relative flex flex-col justify-center overflow-hidden rounded-[1.4cqw] border border-[#82CA8F]/35 bg-[linear-gradient(160deg,rgba(40,70,52,0.72)_0%,rgba(14,34,34,0.78)_100%)] px-[2.3cqw] shadow-[0_1cqw_3cqw_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="text-[1.75cqw] font-medium text-[#E4ECEE]">{k.label}</div>
      <div className="volora-display mt-[0.6cqw] text-[3.4cqw] font-semibold leading-none tracking-[-0.01em] text-white">{k.value}</div>
      <div className="mt-[0.9cqw] flex items-center gap-[0.4cqw] text-[1.95cqw] font-semibold text-[#55B968]">
        <Delta className="h-[2cqw] w-[2cqw]" strokeWidth={2.6} aria-hidden />
        {k.delta}
      </div>
      <div className="absolute right-[2.2cqw] top-1/2 h-[4.4cqw] w-[6cqw] -translate-y-[10%]">
        {k.mark === "bars" ? <MiniBars /> : k.mark === "line" ? <MiniLine /> : <Leaf className="ml-auto h-full w-auto text-[#55B968]" strokeWidth={1.6} aria-hidden />}
      </div>
    </div>
  );
}

/* ─────────────────────────────────── page ─────────────────────────────────── */

export default function VoloraLandingPage() {
  return (
    <main
      className="min-h-screen overflow-x-hidden bg-[#F6F8F7] text-[#0B202B] [--u:min(1vw,16px)]"
      style={{ fontFeatureSettings: '"cv11"' }}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        {/* ═══════════════════════════════ HERO ═══════════════════════════════ */}
        <section className="relative flex flex-col overflow-hidden bg-[#071A22] lg:block lg:h-[calc(var(--u)*49.6)]" aria-labelledby="hero-title">
          {/* Photograph — manufacturing and food manufacturing, diagonal split. */}
          <div className="relative order-2 w-full [container-type:inline-size] lg:absolute lg:right-0 lg:top-0 lg:w-[66.8%]">
            <div className="relative aspect-[684/508] w-full">
              <Image
                src={`${A}/hero.webp`}
                alt="A manufacturing supervisor reviewing VOLORA on a tablet, and a food technician inspecting meals on a production line."
                fill
                priority
                sizes="(min-width: 1024px) 67vw, 100vw"
                className="object-cover"
              />
              {/* Navy treatment: fade into the text column, under the navigation and at the base. */}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#071A22_0%,rgba(7,26,34,0.7)_7%,rgba(7,26,34,0.18)_17%,transparent_26%)]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[24%] bg-[linear-gradient(180deg,#071A22_0%,rgba(7,26,34,0.6)_55%,transparent_100%)] lg:h-[14%] lg:bg-[linear-gradient(180deg,rgba(7,26,34,0.9)_0%,rgba(7,26,34,0.4)_60%,transparent_100%)]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(0deg,#071A22_0%,#071A22_18%,transparent_100%)] md:hidden" />

              {/* Photo captions */}
              <p className="absolute left-[34.6%] top-[17.6%] hidden text-[1.28cqw] sm:block font-semibold uppercase leading-[1.4] tracking-[0.16em] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                <span className="block text-[1.62cqw] tracking-[0.2em]">Manufacturing</span>
                Efficiency today.
                <br />A stronger
                <br />
                tomorrow.
              </p>
              <p className="absolute right-[3.8%] top-[23.4%] hidden text-right text-[1.28cqw] sm:block font-semibold uppercase leading-[1.4] tracking-[0.12em] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                <span className="block text-[1.62cqw] tracking-[0.18em]">
                  Food
                  <br />
                  Manufacturing
                </span>
                Quality ingredients.
                <br />
                Greater profitability.
              </p>
              <span className="sr-only">Good Food. Better Margins.</span>

              {/* Four glass KPI cards — illustrative marketing figures. */}
              <div className="absolute left-[28.1%] top-[60.2%] hidden h-[34.4%] w-[45.4%] grid-cols-2 gap-[1.2cqw] md:grid" role="group" aria-label="Illustrative KPI examples">
                {KPIS.map((k) => (
                  <KpiCard key={k.label} k={k} />
                ))}
              </div>
              <p className="absolute left-[28.1%] top-[95.4%] hidden text-[1.15cqw] font-medium tracking-[0.04em] text-white/55 md:block">
                Illustrative figures — not customer data.
              </p>
            </div>
          </div>

          {/* Navigation */}
          <header className="relative order-0 z-20 lg:absolute lg:inset-x-0 lg:top-0 lg:h-[calc(var(--u)*6.4)]">
            <div className="flex items-center justify-between gap-4 px-5 py-4 lg:h-full lg:items-start lg:px-[calc(var(--u)*4.9)] lg:py-0 lg:pt-[calc(var(--u)*1.15)]">
              <Link href="/" className="flex flex-col items-start" aria-label="VOLORA home">
                <span className="lg:hidden">
                  <VoloraWordmark height={24} variant="onDark" />
                </span>
                <span className="hidden lg:block" style={{ height: u(3.35) }}>
                  <VoloraWordmark height={34} variant="onDark" className="h-full w-auto" />
                </span>
                <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.34em] text-[#DDE7EB] lg:mt-[calc(var(--u)*0.55)] lg:text-[calc(var(--u)*0.74)]">
                  Profitability Intelligence
                </span>
              </Link>

              <nav aria-label="Main" className="hidden items-center lg:flex lg:gap-[calc(var(--u)*2.85)] lg:pt-[calc(var(--u)*0.95)]">
                {NAV.map((n) => (
                  <Link key={n.label} href={n.href} className="font-medium text-white/90 transition hover:text-[#F4C44E] lg:text-[calc(var(--u)*0.98)]">
                    {n.label}
                  </Link>
                ))}
              </nav>

              <div className="flex items-start gap-3 whitespace-nowrap lg:gap-[calc(var(--u)*2.4)]">
                <Link href="/login" aria-label="Search — sign in to search your workspace" className="hidden text-white/90 hover:text-[#F4C44E] lg:mt-[calc(var(--u)*0.95)] lg:block">
                  <Search style={{ width: u(1.5), height: u(1.5) }} aria-hidden />
                </Link>
                <Link href="/login" className="mt-2 text-sm font-semibold text-white hover:text-[#F4C44E] lg:mt-[calc(var(--u)*0.8)] lg:text-[calc(var(--u)*1.02)]">
                  Sign In
                </Link>
                <div className="flex flex-col items-center">
                  <GoldButton href="/login" className="h-9 px-4 text-xs lg:h-[calc(var(--u)*3.05)] lg:px-[calc(var(--u)*2)] lg:text-[calc(var(--u)*1.08)]">
                    Request a Demo <ArrowRight className="h-[1.1em] w-[1.1em]" aria-hidden />
                  </GoldButton>
                  <span className="mt-1 hidden text-[calc(var(--u)*0.76)] font-medium text-white/80 lg:block">A product of Vyronsoft (Pty) Ltd.</span>
                </div>
              </div>
            </div>
          </header>

          {/* Headline block */}
          <div className="relative z-10 order-1 px-5 pb-8 pt-6 lg:absolute lg:left-[calc(var(--u)*5.45)] lg:top-[calc(var(--u)*8.85)] lg:w-[calc(var(--u)*47)] lg:p-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#F4C44E] lg:text-[calc(var(--u)*0.9)]">
              Real data. Smarter decisions. Higher margins.
            </p>
            <h1
              id="hero-title"
              className="volora-display mt-3 text-[2.35rem] font-bold leading-[1.04] tracking-[-0.01em] text-white sm:text-5xl lg:mt-[calc(var(--u)*1.1)] lg:text-[calc(var(--u)*3.98)] lg:font-semibold lg:leading-[1.02]"
            >
              Turn Every Cost
              <br />
              Into a <span className="text-[#F4C44E]">More</span>
              <br />
              <span className="text-[#F4C44E]">Profitable</span> Tomorrow.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/88 lg:mt-[calc(var(--u)*1.9)] lg:w-[calc(var(--u)*29.2)] lg:max-w-none lg:text-[calc(var(--u)*1.28)] lg:leading-[1.52]">
              VOLORA combines your procurement, inventory, production, recipes, labour and sales data into one intelligent
              platform — so you can reduce waste, improve margins and grow a stronger, more profitable business.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 lg:mt-[calc(var(--u)*2.15)] lg:gap-[calc(var(--u)*1.3)]">
              <GoldButton href="/login" className="h-11 px-6 text-sm lg:h-[calc(var(--u)*3.9)] lg:w-[calc(var(--u)*16.8)] lg:text-[calc(var(--u)*1.2)]">
                Request a Demo <ArrowRight className="h-[1.15em] w-[1.15em]" aria-hidden />
              </GoldButton>
              <Link
                href="#platform"
                className="inline-flex h-11 items-center justify-center gap-3 rounded-full border border-white/45 px-6 text-sm font-semibold text-white transition hover:border-[#F4C44E]/80 lg:h-[calc(var(--u)*3.9)] lg:w-[calc(var(--u)*14.6)] lg:whitespace-nowrap lg:text-[calc(var(--u)*1.2)]"
              >
                Watch Video
                <span className="flex h-[1.7em] w-[1.7em] items-center justify-center rounded-full bg-white text-[#071A22]">
                  <Play className="ml-[0.1em] h-[0.8em] w-[0.8em] fill-current" aria-hidden />
                </span>
              </Link>
            </div>
          </div>

          {/* KPI cards in flow on small screens */}
          <div className="relative z-10 order-3 -mt-20 grid grid-cols-2 gap-2.5 px-5 pb-6 md:hidden" role="group" aria-label="Illustrative KPI examples">
            {KPIS.map((k) => (
              <div key={k.label} className="rounded-xl border border-[#82CA8F]/35 bg-[rgba(18,42,40,0.82)] p-3 backdrop-blur-md">
                <div className="text-[11px] font-medium text-[#E4ECEE]">{k.label}</div>
                <div className="volora-display mt-1 text-xl font-semibold text-white">{k.value}</div>
                <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#55B968]">
                  {k.up ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
                  {k.delta}
                </div>
              </div>
            ))}
            <p className="col-span-2 text-[10px] text-white/55">Illustrative figures — not customer data.</p>
          </div>
        </section>

        {/* ═══════════════════════════ BENEFIT STRIP ═══════════════════════════ */}
        <section id="solutions" aria-label="What VOLORA delivers" className="relative z-10 bg-[linear-gradient(180deg,#FFFFFF_0%,#F6F8F7_100%)] px-5 py-10 lg:h-[calc(var(--u)*13)] lg:px-[calc(var(--u)*3.3)] lg:py-0 lg:pt-[calc(var(--u)*2)]">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0 lg:pr-[calc(var(--u)*8)]">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col items-center text-center">
                <Icon className="h-9 w-9 text-[#0B202B] lg:h-[calc(var(--u)*3)] lg:w-[calc(var(--u)*3)]" strokeWidth={1.5} aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold text-[#0B202B] lg:mt-[calc(var(--u)*1.05)] lg:text-[calc(var(--u)*1.22)]">{title}</h3>
                <p className="mt-1 max-w-[15rem] text-[13px] leading-snug text-[#475569] lg:max-w-[calc(var(--u)*14)] lg:text-[calc(var(--u)*0.98)]">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ═════════════════ FROM INGREDIENT TO INCREASED PROFIT ═════════════════ */}
        <section id="platform" aria-labelledby="platform-title" className="relative bg-[#F6F8F7] px-5 pb-12 pt-4 lg:h-[calc(var(--u)*39.8)] lg:p-0">
          {/* Decorative: stainless process tanks and leaves from the reference. */}
          <div className="pointer-events-none absolute right-0 top-[calc(var(--u)*-3.6)] hidden aspect-[137/160] w-[calc(var(--u)*17)] lg:block [mask-image:linear-gradient(90deg,transparent_0%,#000_35%)]">
            <Image src={`${A}/process-tanks.webp`} alt="" fill sizes="16vw" className="object-cover" />
          </div>
          <div className="pointer-events-none absolute left-[calc(var(--u)*88.8)] top-[calc(var(--u)*-10.6)] z-20 hidden aspect-[70/54] w-[calc(var(--u)*6.8)] lg:block">
            <Image src={`${A}/leaf-top.webp`} alt="" fill sizes="8vw" className="object-contain" />
          </div>
          <div className="pointer-events-none absolute left-[calc(var(--u)*28.6)] top-[calc(var(--u)*24.2)] z-0 hidden aspect-[38/80] w-[calc(var(--u)*3.7)] lg:block">
            <Image src={`${A}/leaf-blur.webp`} alt="" fill sizes="5vw" className="object-contain" />
          </div>

          <div className="relative z-10 lg:absolute lg:left-[calc(var(--u)*5.4)] lg:top-[calc(var(--u)*0.7)] lg:w-[calc(var(--u)*25.5)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#2F7C40] lg:text-[calc(var(--u)*0.82)]">One platform. Complete visibility.</p>
            <h2 id="platform-title" className="volora-display mt-3 text-[2rem] font-bold leading-[1.08] text-[#0B202B] lg:mt-[calc(var(--u)*0.9)] lg:text-[calc(var(--u)*2.36)] lg:font-semibold lg:leading-[1.12]">
              From Ingredient
              <br />
              to <span className="text-[#3E9B52]">Increased Profit.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#475569] lg:mt-[calc(var(--u)*1.1)] lg:text-[calc(var(--u)*1.1)] lg:leading-[1.45]">
              VOLORA brings together your financial, operational and production data — giving you the clarity to make
              faster, smarter decisions across your entire business.
            </p>
            <ul className="mt-5 space-y-2.5 lg:mt-[calc(var(--u)*1.4)] lg:space-y-[calc(var(--u)*0.6)]">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[15px] text-[#1E293B] lg:gap-[calc(var(--u)*0.95)] lg:text-[calc(var(--u)*1.1)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3E9B52] text-white lg:h-[calc(var(--u)*1.55)] lg:w-[calc(var(--u)*1.55)]">
                    <Check className="h-[70%] w-[70%]" strokeWidth={3} aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-6 inline-flex h-11 items-center gap-3 rounded-full border-[1.5px] border-[#3E9B52] px-6 text-sm font-semibold text-[#2F7C40] transition hover:bg-[#3E9B52]/[0.07] lg:mt-[calc(var(--u)*1.7)] lg:h-[calc(var(--u)*3.1)] lg:px-[calc(var(--u)*1.8)] lg:text-[calc(var(--u)*1.2)]"
            >
              Explore the Platform <ArrowRight className="h-[1.1em] w-[1.1em]" aria-hidden />
            </Link>
          </div>

          {/* Laptop with the real VOLORA dashboard */}
          <figure className="relative z-10 mt-10 lg:absolute lg:left-[calc(var(--u)*29)] lg:top-[calc(var(--u)*1.9)] lg:mt-0 lg:w-[calc(var(--u)*55.4)]">
            <div className="mx-auto w-[92%] rounded-[1.2rem] bg-[#15181C] p-[1.6%] shadow-[0_30px_60px_rgba(6,23,34,0.28)] ring-1 ring-black/60">
              <div className="relative aspect-[1440/900] overflow-hidden rounded-[0.35rem] bg-white">
                <Image src={`${A}/app-dashboard.webp`} alt="The VOLORA Business Overview dashboard (demo workspace)." fill sizes="(min-width: 1024px) 52vw, 90vw" className="object-cover object-top" />
              </div>
            </div>
            <div className="relative mx-auto h-[calc(var(--u)*1.3)] min-h-3 w-full rounded-b-[1.2rem] bg-[linear-gradient(180deg,#D5D9DE_0%,#9AA1A9_55%,#6B7178_100%)] shadow-[0_18px_30px_rgba(6,23,34,0.25)]">
              <span className="absolute left-1/2 top-0 h-[40%] w-[14%] -translate-x-1/2 rounded-b-md bg-[#8A9097]" />
            </div>
            <figcaption className="mt-2 text-center text-[11px] text-[#64748B] lg:text-[calc(var(--u)*0.78)]">Actual VOLORA screens · demo workspace</figcaption>
          </figure>

          {/* Phone with the real VOLORA mobile workspace */}
          <figure className="relative z-20 mx-auto mt-8 w-[46%] max-w-[15rem] lg:absolute lg:left-[calc(var(--u)*84.6)] lg:top-[calc(var(--u)*9.9)] lg:mt-0 lg:w-[calc(var(--u)*13.6)] lg:max-w-none">
            <div className="rounded-[2.2rem] bg-[#0E1114] p-[5%] shadow-[0_24px_50px_rgba(6,23,34,0.35)] ring-1 ring-[#3a4148] lg:rounded-[calc(var(--u)*2.3)]">
              <div className="relative aspect-[390/844] overflow-hidden rounded-[1.7rem] bg-white lg:rounded-[calc(var(--u)*1.8)]">
                <Image src={`${A}/app-mobile.webp`} alt="The VOLORA mobile Manufacturing screen (demo workspace)." fill sizes="(min-width: 1024px) 14vw, 45vw" className="object-cover object-top" />
                <span className="absolute left-1/2 top-[1.2%] h-[3.2%] w-[34%] -translate-x-1/2 rounded-full bg-[#0E1114]" />
              </div>
            </div>
          </figure>
          <div className="pointer-events-none absolute left-[calc(var(--u)*92)] top-[calc(var(--u)*34.6)] z-30 hidden aspect-[56/80] w-[calc(var(--u)*5.5)] lg:block">
            <Image src={`${A}/leaf-drop.webp`} alt="" fill sizes="6vw" className="object-contain" />
          </div>
        </section>

        {/* ════════════════════ REAL SOLUTIONS. REAL RESULTS. ════════════════════ */}
        <section id="industries" aria-labelledby="industries-title" className="bg-[#F6F8F7] px-5 pb-12 lg:px-[calc(var(--u)*3.3)] lg:pb-[calc(var(--u)*3.55)] lg:pt-[calc(var(--u)*1.2)]">
          <div className="flex flex-wrap items-end justify-between gap-3 lg:pl-[calc(var(--u)*2.8)] lg:pr-[calc(var(--u)*0.5)]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#163A48] lg:text-[calc(var(--u)*0.82)]">Built for your industry</p>
              <h2 id="industries-title" className="volora-display mt-2 text-[1.75rem] font-bold text-[#0B202B] lg:mt-[calc(var(--u)*0.6)] lg:text-[calc(var(--u)*2.2)]">
                Real Solutions. Real Results.
              </h2>
            </div>
            <Link href="#industries" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B202B] hover:text-[#2F7C40] lg:text-[calc(var(--u)*0.95)]">
              View All Industries <ArrowRight className="h-[1.1em] w-[1.1em]" aria-hidden />
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:mt-[calc(var(--u)*0.15)] lg:grid-cols-7 lg:gap-[calc(var(--u)*1.1)]">
            {INDUSTRIES.map(({ slug, label, icon: Icon }) => (
              <li key={slug} className="relative aspect-[123/152] overflow-hidden rounded-xl shadow-[0_10px_24px_rgba(6,23,34,0.18)] lg:rounded-[calc(var(--u)*0.8)]">
                <Image src={`${A}/industry-${slug}.webp`} alt="" fill sizes="(min-width: 1024px) 13vw, 45vw" className="object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(9,24,34,0.96)_0%,rgba(9,24,34,0.75)_32%,transparent_62%)]" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white lg:p-[calc(var(--u)*1.1)]">
                  <Icon className="h-6 w-6 lg:h-[calc(var(--u)*1.9)] lg:w-[calc(var(--u)*1.9)]" strokeWidth={1.5} aria-hidden />
                  <p className="mt-2 text-sm font-semibold leading-tight lg:mt-[calc(var(--u)*0.7)] lg:text-[calc(var(--u)*1.15)]">
                    {label.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ═══════════════════════════ CLOSING BANNER ═══════════════════════════ */}
        <section id="resources" aria-labelledby="closing-title" className="relative overflow-hidden bg-[#071A22] [container-type:inline-size]">
          <div className="relative min-h-[28rem] w-full lg:aspect-[1024/224] lg:min-h-0">
            <Image src={`${A}/closing-banner.webp`} alt="Sunrise over mountains and a road through green farmland." fill sizes="100vw" className="object-cover object-[65%_50%]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,26,34,0.55)_0%,transparent_45%)] lg:bg-none" />
            <div className="absolute inset-0 bg-[rgba(7,26,34,0.35)] lg:hidden" />

            <div className="relative z-10 px-5 py-10 lg:absolute lg:left-[6.1%] lg:top-[11.4%] lg:p-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#F4C44E] lg:text-[calc(var(--u)*0.82)]">Profitability today. A stronger tomorrow.</p>
              <h2 id="closing-title" className="volora-display mt-3 text-[2rem] font-bold leading-[1.1] text-white lg:mt-[calc(var(--u)*1)] lg:text-[calc(var(--u)*2.95)]">
                Smarter Businesses
                <br />
                Feed a <span className="text-[#55B968]">Brighter Future.</span>
              </h2>
              <p className="mt-3 text-[15px] text-white/85 lg:mt-[calc(var(--u)*1.1)] lg:text-[calc(var(--u)*1.28)]">Let&apos;s build a more profitable, sustainable tomorrow — together.</p>
              <div className="mt-6 flex flex-wrap gap-3 lg:hidden">
                <GoldButton href="/login" className="h-11 px-6 text-sm">
                  Request a Demo <ArrowRight className="h-4 w-4" aria-hidden />
                </GoldButton>
                <Link href="/login" className="inline-flex h-11 items-center rounded-full border border-[#F4C44E]/60 px-6 text-sm font-semibold text-white">
                  Talk to Our Team
                </Link>
              </div>
            </div>

            <div className="absolute left-[50.5%] top-[31%] z-10 hidden gap-[calc(var(--u)*1.2)] lg:flex">
              <GoldButton href="/login" className="h-[calc(var(--u)*3.2)] w-[calc(var(--u)*14.3)] text-[calc(var(--u)*1.1)]">
                Request a Demo <ArrowRight className="h-[1.15em] w-[1.15em]" aria-hidden />
              </GoldButton>
              <Link
                href="/login"
                className="inline-flex h-[calc(var(--u)*3.2)] w-[calc(var(--u)*12.3)] items-center justify-center rounded-full border border-[#F4C44E]/60 bg-[#071A22]/40 text-[calc(var(--u)*1.1)] font-semibold text-white transition hover:border-[#F4C44E]"
              >
                Talk to Our Team
              </Link>
            </div>

            <div id="about" className="relative z-10 flex items-center gap-4 px-5 pb-10 lg:absolute lg:left-[81.6%] lg:top-[34.5%] lg:gap-[calc(var(--u)*1.4)] lg:p-0">
              <Leaf className="h-10 w-10 text-[#55B968] lg:h-[calc(var(--u)*3.4)] lg:w-[calc(var(--u)*3.4)]" strokeWidth={1.6} aria-hidden />
              <ul className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white lg:space-y-[calc(var(--u)*0.95)] lg:text-[calc(var(--u)*0.84)]">
                <li>People</li>
                <li>Profitability</li>
                <li>Progress</li>
              </ul>
            </div>
            <p className="relative z-10 px-5 pb-6 text-xs text-white/85 lg:absolute lg:bottom-[12.5%] lg:right-[3.7%] lg:p-0 lg:text-[calc(var(--u)*0.82)]">
              A product of Vyronsoft (Pty) Ltd.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
