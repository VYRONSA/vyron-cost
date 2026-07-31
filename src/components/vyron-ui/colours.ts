/**

 * Shared colour/status tokens — aligned with VYRON_MASTER (Batch 4).

 * Prefer VYRON_MASTER from style-tokens.ts for new code.

 */

import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";



const M = VYRON_MASTER;



export const VYRON_TEXT = {

  heading: "text-[#0F172A]",

  body: "text-[#334155]",

  muted: "text-[#64748B]",

  brand: "text-[#1D6BFF]",

  lime: "text-[#1D6BFF]",

  warning: "vyron-metric-warning",

  danger: "vyron-metric-error",

} as const;



export const VYRON_STATUS = {

  lime: M.statusSuccess,

  warning: M.statusWarning,

  brand: M.statusBrand,

  neutral: M.statusNeutral,

  xero: M.statusXero,

  positive: M.statusSuccess,

} as const;



export const VYRON_BTN = {

  primary: `${M.primaryBtn} px-5 py-3 text-sm`,

  secondary: `${M.secondaryBtn} px-5 py-3 text-sm`,

  warning: "rounded-xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-5 py-3 text-sm font-semibold text-[var(--vyron-warning-fg)]",

} as const;



export const VYRON_SURFACE = {

  dark: `${M.darkPanelInner} rounded-2xl`,

  darkShell: `${M.dashboardHero} rounded-2xl`,

  darkElevated: M.lightCard,

  light: M.lightCard,

  lightNested: M.modulePanelNested,

} as const;



/** Positive financial values on light surfaces */

export const VYRON_POSITIVE_ON_LIGHT = "vyron-metric-success";

export const VYRON_LIME_ON_LIGHT = "text-[#1D6BFF]";



export const VYRON_TABLE = {
  head: "bg-[#F6F7FB] text-[11px] font-bold uppercase tracking-[0.12em] text-[#475569]",
  headOnDark: "bg-[#0A3BA8] text-[11px] font-bold uppercase tracking-[0.12em] text-[#CBD5E1]",
  headAccent: "text-[#1D6BFF]",
  row: "border-b border-[#E2E8F0] text-[#334155]",
  rowOnDark: "border-t border-white/10 text-[#E2E8F0] hover:bg-white/[0.04]",
  rowHover: "hover:bg-[#F8FAFC]",
  surface: "overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]",
  empty: "text-sm font-semibold text-[#64748B]",
  emptyOnDark: "text-sm font-semibold text-[#94A3B8]",
} as const;

