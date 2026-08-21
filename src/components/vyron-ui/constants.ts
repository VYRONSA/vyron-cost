/** Shared VYRON COST UI tokens — single source for page layout and colours. */
export const VYRON_LIME = "#1D6BFF";
export const VYRON_HEADING = "#0F172A";
export const VYRON_BODY = "#334155";
export const VYRON_MUTED = "#64748B";
export const VYRON_CARD = "#FFFFFF";
export const VYRON_CARD_ELEVATED = "#FFFFFF";
export const VYRON_CARD_SHELL = "#0B1220";
export const VYRON_BORDER = "rgba(255,255,255,0.12)";

export const VYRON_PAGE_GAP = "gap-5";
export const VYRON_CARD_GAP = "gap-3";
export const VYRON_MAX_WIDTH = "max-w-[1440px]";
/**
 * Wider clamp for transaction registers and invoice detail, where columns are
 * the content and a 1440px cap leaves a 1920px monitor with dead margin beside
 * a horizontally scrolling table. Still clamped rather than full-bleed so line
 * length stays readable on ultrawide displays.
 */
export const VYRON_MAX_WIDTH_WIDE = "max-w-[1760px]";
export const VYRON_PAGE_PADDING = "px-6 md:px-8";