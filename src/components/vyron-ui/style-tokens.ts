/**
 * VYRON COST — Master visual direction (Batch 1 foundation).
 * Light premium workspace + navy panels + red-purple accents.
 * Use these tokens for all new migrations; do not hardcode one-off colours.
 */

export const VYRON_MASTER_COLOUR = {
  pageBg: "#F8FAFC",
  pageBgAlt: "#F6F7FB",
  pageBgMuted: "#EEF2F7",
  navy: "#07111F",
  navyMid: "#0B1220",
  navyPanel: "#101827",
  red: "#F43F5E",
  redDark: "#E11D48",
  purple: "#7C3AED",
  purpleBright: "#9333EA",
  textDark: "#0F172A",
  textBody: "#334155",
  textMuted: "#64748B",
  white: "#FFFFFF",
  border: "#E2E8F0",
  borderSubtle: "rgba(15, 23, 42, 0.08)",
  darkBorder: "rgba(255, 255, 255, 0.10)",
  xeroBlue: "#13B5EA",
} as const;

/** Tailwind class bundles — single source for public + future internal migration */
export const VYRON_MASTER = {
  page: "vyron-public-page min-h-screen overflow-x-hidden bg-[#F8FAFC] text-[#334155]",
  pageAlt: "bg-[#F6F7FB]",
  pageMuted: "bg-[#EEF2F7]",

  darkShell: "bg-[#07111F] text-[#F8FAFC]",
  darkPanel:
    "rounded-[2rem] border border-white/10 bg-[#0B1220] text-[#F8FAFC] shadow-[0_20px_60px_rgba(7,17,31,0.32)]",
  darkPanelInner: "rounded-[1.5rem] border border-white/10 bg-[#101827]",

  lightCard:
    "rounded-3xl border border-[#E2E8F0] bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]",
  lightCardHover:
    "transition hover:border-[rgba(15,23,42,0.12)] hover:shadow-[0_12px_40px_rgba(15,23,42,0.08)]",

  primaryBtn:
    "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#E11D48] to-[#7C3AED] font-bold text-white shadow-[0_8px_24px_rgba(124,58,237,0.22)] transition hover:shadow-[0_10px_28px_rgba(225,29,72,0.28)]",
  secondaryBtn:
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white font-semibold text-[#334155] shadow-sm transition hover:border-[rgba(15,23,42,0.12)]",
  ghostBtn:
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-[#F6F7FB] font-semibold text-[#64748B] transition hover:text-[#334155]",

  input:
    "w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15",
  label: "text-[10px] font-black uppercase tracking-[0.18em] text-[#64748B]",

  tableHead:
    "bg-[#F6F7FB] text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748B]",
  tableRow: "border-b border-[#E2E8F0] hover:bg-[#F8FAFC]",

  statusRecommended:
    "rounded-full border border-[#E11D48]/30 bg-gradient-to-r from-[#E11D48]/10 to-[#7C3AED]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#E11D48]",
  statusBrand:
    "rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7C3AED]",
  statusLive:
    "rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold text-[#F8FAFC]",
  statusXero:
    "rounded-full border border-[#13B5EA]/30 bg-[#13B5EA]/10 px-3 py-1 text-[10px] font-bold text-[#13B5EA]",

  sectionLabel: "text-xs font-bold uppercase tracking-[0.18em] text-[#7C3AED]",
  heading: "font-black tracking-[-0.03em] text-[#0F172A]",
  headingOnDark: "font-black tracking-[-0.03em] text-[#F8FAFC]",
  body: "font-medium text-[#334155]",
  bodyOnDark: "font-medium text-[#CBD5E1]",
  muted: "text-[#64748B]",
  mutedOnDark: "text-[#94A3B8]",

  gradientText:
    "bg-gradient-to-r from-[#E11D48] via-[#9333EA] to-[#7C3AED] bg-clip-text text-transparent",
  accentKpi: "font-black text-[#E11D48]",
  accentKpiGradient:
    "font-black bg-gradient-to-r from-[#E11D48] to-[#9333EA] bg-clip-text text-transparent",

  iconEmphasis:
    "flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#E11D48] to-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.22)]",
  iconSubtle:
    "flex items-center justify-center rounded-2xl border border-[#E2E8F0] bg-[#F6F7FB] text-[#7C3AED]",
  iconXero:
    "flex items-center justify-center rounded-2xl border border-[#13B5EA]/25 bg-[#13B5EA]/10 text-[#13B5EA]",

  navLink: "text-sm font-semibold text-[#64748B] transition hover:text-[#0F172A]",
  eyebrow:
    "inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7C3AED] shadow-sm sm:text-xs",

  pricingPopular:
    "border-[#7C3AED]/35 shadow-[0_12px_40px_rgba(124,58,237,0.12)] ring-1 ring-[#E11D48]/20",

  publicHeader:
    "sticky top-0 z-30 border-b border-[#E2E8F0]/80 bg-white/90 backdrop-blur-xl",

  /** Internal app shell (Batch 2) */
  shellRoot:
    "vyron-cost-shell vyron-master-workspace h-screen w-full overflow-hidden bg-[#F8FAFC] text-[#334155]",
  shellSidebar:
    "vyron-cost-shell-sidebar fixed left-0 top-0 z-[50] flex h-screen w-[330px] min-w-[330px] max-w-[330px] flex-col overflow-hidden border-r border-[#E2E8F0] bg-white px-4 py-5 shadow-[4px_0_24px_rgba(15,23,42,0.04)]",
  shellTopbar: "shrink-0 border-b border-[#E2E8F0]/80 bg-white/90 backdrop-blur-xl",
  shellPageHeader:
    "relative mb-5 min-w-0 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] md:p-7",
  navActive:
    "border border-[#7C3AED]/20 bg-gradient-to-r from-[#E11D48]/10 to-[#7C3AED]/12 text-[#0F172A] shadow-sm",
  navActiveDashboard:
    "border border-transparent bg-gradient-to-r from-[#E11D48] to-[#7C3AED] text-white shadow-[0_6px_20px_rgba(124,58,237,0.25)]",
  navInactive: "text-[#64748B] hover:bg-[#F6F7FB] hover:text-[#0F172A]",
  navSectionLabel: "text-xs font-bold uppercase tracking-[0.14em] text-[#64748B]",
  shellClientCard: "rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-3",
  shellSearch:
    "hidden h-10 min-w-0 max-w-xl flex-1 items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 md:flex",
  shellWorkspaceBadge:
    "hidden h-10 min-w-0 max-w-[340px] items-center rounded-xl border border-[#E2E8F0] bg-white px-4 lg:flex",
  shellTopbarBtn:
    "inline-flex h-10 shrink-0 items-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#334155] shadow-sm transition hover:bg-[#F6F7FB]",

  /** Dashboard (Batch 3) */
  dashboardHero:
    "relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-[0_12px_40px_rgba(7,17,31,0.22)]",
  dashboardHeroInner: "rounded-xl border border-white/10 bg-[#101827]",
  dashboardHeroRow: "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3",
  dashboardWidget:
    "min-w-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]",
  dashboardWidgetNested: "rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-3",
  metricValueDefault: "text-[#0F172A]",
  metricValueHealthy: "text-[#7C3AED]",
  metricValueWarning: "text-[#E11D48]",
  metricValueDanger: "text-[#E11D48]",
  metricValueMonitoring: "text-[#7C3AED]",

  /** Module page framework (Batch 4) */
  moduleHeader:
    "relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] p-6 shadow-[0_12px_40px_rgba(7,17,31,0.22)] md:p-7",
  modulePanel: "relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.05)]",
  modulePanelNested: "rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] p-4",
  moduleEmptyState: "rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center md:p-10",

  /** Readability + colour balance (Batch 4A) */
  moduleHeaderNavy:
    "relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] p-6 shadow-[0_12px_40px_rgba(7,17,31,0.22)] md:p-7",
  moduleIntelligenceNavy:
    "relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] p-6 shadow-[0_12px_40px_rgba(7,17,31,0.18)] md:p-7",
  filterBar:
    "mb-5 rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-[0_4px_16px_rgba(15,23,42,0.05)]",
  filterBarOnDark:
    "mb-5 rounded-2xl border border-white/10 bg-[#101827] p-3 shadow-[0_4px_16px_rgba(0,0,0,0.2)]",
  tableSurface:
    "overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]",
  tableSurfaceOnDark:
    "overflow-x-auto rounded-2xl border border-white/10 bg-[#101827] shadow-[0_4px_16px_rgba(0,0,0,0.15)]",
  tableHeadOnDark:
    "bg-[#07111F] text-[11px] font-bold uppercase tracking-[0.12em] text-[#CBD5E1]",
  tableRowOnDark: "border-t border-white/10 text-[#E2E8F0] hover:bg-white/[0.04]",
  tableEmptyOnDark: "text-sm font-semibold text-[#94A3B8]",
  tableEmptyLight: "text-sm font-semibold text-[#64748B]",
  inputPlaceholder: "placeholder:text-[#94A3B8]",
  select:
    "rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15",
  selectOnDark:
    "rounded-xl border border-white/15 bg-[#101827] px-3 py-2 text-sm font-semibold text-[#F8FAFC] outline-none focus:border-[#7C3AED]/50",
  moduleDataSection:
    "rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.05)] md:p-6",
} as const;
