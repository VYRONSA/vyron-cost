/**
 * VYRON COST — Master visual direction (Batch 1 foundation).
 * VYRON Enterprise Design Language. Blue→purple brand fade, glass surfaces and a
 * layered elevation scale; presentation only — layouts and spacing are unchanged.
 * Use these tokens for all new migrations; do not hardcode one-off colours.
 */

export const VYRON_MASTER_COLOUR = {
  pageBg: "#F8FAFC",
  pageBgAlt: "#F6F7FB",
  pageBgMuted: "#EEF2F7",
  navy: "#07111F",
  navyMid: "#0B1220",
  navyPanel: "#101827",
  blue: "#1D6BFF",
  blueDeep: "#2563EB",
  blueLight: "#3B82F6",
  blueDark: "#1D4ED8",
  sidebar: "#1D6BFF",
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
  page: "vyron-public-page vyron-interactive-root min-h-screen overflow-x-hidden text-[#334155]",
  pageAlt: "bg-[#F6F7FB]",
  pageMuted: "bg-[#EEF2F7]",

  darkShell: "vyron-grad-deep text-[#F8FAFC]",
  darkPanel:
    "rounded-[2rem] border border-white/10 vyron-grad-deep text-[#F8FAFC] shadow-[0_24px_72px_rgba(10,59,168,0.34)]",
  darkPanelInner: "rounded-[1.5rem] border border-white/10 vyron-grad-deep-inner",

  lightCard:
    "rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white/72 shadow-[var(--vyron-elev-3)] backdrop-blur-xl backdrop-saturate-150",
  lightCardHover:
    "transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(15,23,42,0.11)] hover:shadow-[var(--vyron-elev-4)]",

  primaryBtn:
    "inline-flex items-center justify-center gap-2 rounded-xl vyron-grad-surface font-semibold text-white shadow-[var(--vyron-elev-brand)] transition hover:brightness-[1.07] hover:shadow-[var(--vyron-elev-4)] active:brightness-95",
  secondaryBtn:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 font-medium text-[#334155] shadow-[var(--vyron-elev-1)] backdrop-blur transition hover:border-[rgba(15,23,42,0.14)] hover:bg-white",
  ghostBtn:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent font-medium text-[#64748B] transition hover:bg-[rgba(15,23,42,0.04)] hover:text-[#334155]",

  input:
    "w-full rounded-xl border border-[rgba(15,23,42,0.10)] bg-white/85 px-4 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#4F46E5] focus:bg-white focus:ring-4 focus:ring-[#4F46E5]/12",
  label: "vyron-t-label text-[10px] text-[#64748B]",

  tableHead:
    "bg-[rgba(15,23,42,0.03)] vyron-t-label text-[11px] text-[#64748B]",
  tableRow: "border-b border-[rgba(15,23,42,0.06)] transition hover:bg-[rgba(79,70,229,0.045)]",

  /** Semantic status — reserved hues from the design language. Use ONLY where
      state is communicated (badges, alerts, validation, workflow/approval,
      health, AI recommendations, executive signals). Never decorative. */
  statusSuccess: "vyron-status vyron-status-success",
  statusWarning: "vyron-status vyron-status-warning",
  statusError: "vyron-status vyron-status-error",
  statusInfo: "vyron-status vyron-status-info",
  statusNeutral: "vyron-status vyron-status-neutral",
  alertSuccess: "vyron-alert vyron-alert-success",
  alertWarning: "vyron-alert vyron-alert-warning",
  alertError: "vyron-alert vyron-alert-error",
  alertInfo: "vyron-alert vyron-alert-info",

  statusRecommended:
    "rounded-full border border-[#2563EB]/30 bg-gradient-to-r from-[#2563EB]/10 to-[#1D6BFF]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#2563EB]",
  statusBrand:
    "rounded-full border border-[#1D6BFF]/25 bg-[#1D6BFF]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#1D6BFF]",
  statusLive:
    "rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold text-[#F8FAFC]",
  statusXero:
    "rounded-full border border-[#13B5EA]/30 bg-[#13B5EA]/10 px-3 py-1 text-[10px] font-bold text-[#13B5EA]",

  sectionLabel: "vyron-t-label text-xs text-[#4F46E5]",
  heading: "vyron-t-display text-[#0F172A]",
  headingOnDark: "vyron-t-display text-[#F8FAFC]",
  body: "font-medium text-[#334155]",
  bodyOnDark: "font-medium text-[#CBD5E1]",
  muted: "text-[#64748B]",
  mutedOnDark: "text-[#94A3B8]",

  gradientText:
    "vyron-grad-text",
  /** Same fade rebalanced to light stops, for headings on the deep panels. */
  gradientTextOnDark: "vyron-grad-text-on-deep",
  accentKpi: "font-black text-[#2563EB]",
  accentKpiGradient:
    "font-black vyron-grad-text",

  iconEmphasis:
    "flex items-center justify-center rounded-xl vyron-grad-surface text-white shadow-[var(--vyron-elev-brand)]",
  iconSubtle:
    "flex items-center justify-center rounded-xl border border-[rgba(15,23,42,0.06)] bg-[rgba(79,70,229,0.06)] text-[#4F46E5]",
  iconXero:
    "flex items-center justify-center rounded-2xl border border-[#13B5EA]/25 bg-[#13B5EA]/10 text-[#13B5EA]",

  navLink: "text-sm font-semibold text-[#64748B] transition hover:text-[#0F172A]",
  eyebrow:
    "inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.07)] bg-white/70 px-4 py-2 vyron-t-label text-[10px] text-[#4F46E5] shadow-[var(--vyron-elev-1)] backdrop-blur sm:text-xs",

  pricingPopular:
    "border-[#1D6BFF]/35 shadow-[0_12px_40px_rgba(29,107,255,0.12)] ring-1 ring-[#2563EB]/20",

  publicHeader:
    "sticky top-0 z-30 border-b border-[rgba(15,23,42,0.06)] bg-white/68 backdrop-blur-xl backdrop-saturate-150",

  /** Internal app shell (Batch 2) */
  shellRoot:
    "vyron-cost-shell vyron-master-workspace vyron-interactive-root h-screen w-full overflow-hidden bg-[#F8FAFC] text-[#334155]",
  shellSidebar:
    "vyron-cost-shell-sidebar fixed left-0 top-0 z-[50] flex h-screen w-[330px] min-w-[330px] max-w-[330px] flex-col overflow-hidden border-r border-white/10 bg-[#3D3AB8] px-4 py-5",
  shellTopbar: "shrink-0 border-b border-[rgba(15,23,42,0.06)] bg-white/68 backdrop-blur-xl backdrop-saturate-150",
  shellPageHeader:
    "relative mb-5 min-w-0 overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white/72 p-6 shadow-[var(--vyron-elev-2)] backdrop-blur-xl backdrop-saturate-150 md:p-7",
  navActive:
    "border border-[#1D6BFF]/20 bg-gradient-to-r from-[#2563EB]/10 to-[#1D6BFF]/12 text-[#0F172A] shadow-sm",
  navActiveDashboard:
    "border border-transparent vyron-grad-surface text-white shadow-[0_6px_20px_rgba(29,107,255,0.25)]",
  navInactive: "text-[#64748B] hover:bg-[#F6F7FB] hover:text-[#0F172A]",
  navSectionLabel: "vyron-t-label text-xs text-[#64748B]",
  shellClientCard: "rounded-xl border border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.025)] px-4 py-3",

  /** Workspace sidebar — sits on the blue→green brand fade, so every child needs an
      on-brand tone. The light `nav*` tokens above still serve the developer shell. */
  sidebarNavActive:
    "border border-white/25 vyron-grad-active text-white shadow-[0_2px_10px_rgba(7,17,31,0.20)]",
  sidebarNavActiveDashboard:
    "border border-white/25 vyron-grad-active text-white shadow-[0_2px_10px_rgba(7,17,31,0.20)]",
  sidebarNavInactive: "text-[#D7E3FF] transition hover:bg-white/10 hover:text-white",
  sidebarSectionOpen: "bg-white/10 text-white",
  sidebarSectionClosed: "transition hover:bg-white/[0.07]",
  sidebarSectionLabel: "vyron-t-label text-xs text-[#C7D9FF]",
  sidebarIcon: "text-[#C7D9FF]",
  sidebarIconActive: "text-white",
  sidebarLockedRow: "text-[#BFDBFE]/70",
  sidebarBadge:
    "rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#E0EAFF]",
  sidebarDivider: "border-white/18",
  sidebarClientCard: "rounded-xl border border-white/20 bg-white/12 px-4 py-3",
  sidebarClientName: "truncate text-sm font-bold text-white",
  sidebarClientMeta:
    "mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#BFDBFE]",
  sidebarSignOutBtn:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 font-medium text-white transition hover:border-white/35 hover:bg-white/18",
  shellSearch:
    "hidden h-10 min-w-0 max-w-xl flex-1 items-center gap-3 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white/60 px-4 backdrop-blur transition hover:border-[rgba(15,23,42,0.12)] md:flex",
  shellWorkspaceBadge:
    "hidden h-10 min-w-0 max-w-[340px] items-center rounded-xl border border-[rgba(15,23,42,0.08)] bg-white/70 px-4 backdrop-blur lg:flex",
  shellTopbarBtn:
    "inline-flex h-10 shrink-0 items-center rounded-xl border border-[rgba(15,23,42,0.08)] bg-white/70 px-4 text-sm font-medium text-[#334155] shadow-[var(--vyron-elev-1)] backdrop-blur transition hover:border-[rgba(15,23,42,0.13)] hover:bg-white",

  /** Dashboard (Batch 3) */
  dashboardHero:
    "relative min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-white/10 vyron-grad-deep shadow-[0_20px_60px_rgba(10,59,168,0.30)]",
  dashboardHeroInner: "rounded-xl border border-white/10 vyron-grad-deep-inner",
  dashboardHeroRow: "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3",
  dashboardWidget:
    "min-w-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white/90 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.09)]",
  dashboardWidgetNested: "rounded-xl border border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.025)] px-4 py-3",
  metricValueDefault: "text-[#0F172A]",
  metricValueHealthy: "vyron-metric-success",
  metricValueWarning: "vyron-metric-warning",
  metricValueDanger: "vyron-metric-error",
  metricValueMonitoring: "vyron-metric-info",

  /** Module page framework (Batch 4) */
  moduleHeader:
    "relative min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-white/10 vyron-grad-deep p-6 shadow-[0_20px_60px_rgba(10,59,168,0.30)] md:p-7",
  modulePanel: "relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white/72 p-6 shadow-[var(--vyron-elev-2)] backdrop-blur-xl backdrop-saturate-150",
  modulePanelNested: "rounded-xl border border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.025)] p-4",
  moduleEmptyState: "rounded-2xl border border-dashed border-[rgba(15,23,42,0.10)] bg-[rgba(15,23,42,0.02)] p-8 text-center md:p-10",

  /** Readability + colour balance (Batch 4A) */
  moduleHeaderNavy:
    "relative min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-white/10 vyron-grad-deep p-6 shadow-[0_20px_60px_rgba(10,59,168,0.30)] md:p-7",
  moduleIntelligenceNavy:
    "relative min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-white/10 vyron-grad-deep p-6 shadow-[0_20px_60px_rgba(10,59,168,0.26)] md:p-7",
  filterBar:
    "mb-5 rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white/72 p-3 shadow-[var(--vyron-elev-2)] backdrop-blur-xl backdrop-saturate-150",
  filterBarOnDark:
    "mb-5 rounded-2xl border border-white/10 vyron-grad-deep-inner p-3 shadow-[0_4px_16px_rgba(10,59,168,0.20)]",
  tableSurface:
    "overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white/72 shadow-[var(--vyron-elev-2)] backdrop-blur-xl backdrop-saturate-150",
  tableSurfaceOnDark:
    "overflow-x-auto rounded-2xl border border-white/10 vyron-grad-deep-inner shadow-[0_4px_16px_rgba(10,59,168,0.16)]",
  tableHeadOnDark:
    "bg-[#0A3BA8] text-[11px] font-bold uppercase tracking-[0.12em] text-[#CBD5E1]",
  tableRowOnDark: "border-t border-white/10 text-[#E2E8F0] hover:bg-white/[0.04]",
  tableEmptyOnDark: "text-sm font-semibold text-[#94A3B8]",
  tableEmptyLight: "text-sm font-semibold text-[#64748B]",
  inputPlaceholder: "placeholder:text-[#94A3B8]",
  select:
    "rounded-xl border border-[rgba(15,23,42,0.10)] bg-white/85 px-3 py-2 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#4F46E5] focus:bg-white focus:ring-4 focus:ring-[#4F46E5]/12",
  selectOnDark:
    "rounded-xl border border-white/15 vyron-grad-deep-inner px-3 py-2 text-sm font-semibold text-[#F8FAFC] outline-none focus:border-[#1D6BFF]/50",
  moduleDataSection:
    "rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white/72 p-5 shadow-[var(--vyron-elev-2)] backdrop-blur-xl backdrop-saturate-150 md:p-6",
} as const;
