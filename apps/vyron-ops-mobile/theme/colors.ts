export const colors = {
  background: "#061722",
  surface: "#0B202B",
  card: "#0F2D39",
  cardGlass: "rgba(15, 45, 57, 0.72)",
  border: "#163A48",
  emerald: "#43A95A",
  emeraldDark: "#3E9B52",
  emeraldGlow: "#55B968",
  violet: "#F4C44E", // VOLORA gold (key kept for existing call sites)
  gold: "#F4C44E",
  rose: "#F43F5E",
  amber: "#F59E0B",
  sky: "#5F8595",
  text: "#F8FAFC",
  muted: "#93AEB9",
  subtle: "#5F8595",
  white: "#FFFFFF",
  black: "#000000",
  success: "#43A95A",
  warning: "#F59E0B",
  danger: "#F43F5E",
  info: "#5F8595",
} as const;

export type StatusColor = "success" | "warning" | "danger" | "info" | "neutral";

export const statusColors: Record<StatusColor, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
  neutral: colors.subtle,
};
