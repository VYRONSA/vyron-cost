export const colors = {
  background: "#070D18",
  surface: "#0F172A",
  card: "#152033",
  cardGlass: "rgba(21, 32, 51, 0.72)",
  border: "#1E293B",
  emerald: "#10B981",
  emeraldDark: "#059669",
  emeraldGlow: "#34D399",
  violet: "#7C3AED",
  rose: "#F43F5E",
  amber: "#F59E0B",
  sky: "#38BDF8",
  text: "#F8FAFC",
  muted: "#94A3B8",
  subtle: "#64748B",
  white: "#FFFFFF",
  black: "#000000",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#F43F5E",
  info: "#38BDF8",
} as const;

export type StatusColor = "success" | "warning" | "danger" | "info" | "neutral";

export const statusColors: Record<StatusColor, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
  neutral: colors.subtle,
};
