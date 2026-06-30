import { TextStyle } from "react-native";
import { colors } from "./colors";

export const typography = {
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: colors.text,
  } satisfies TextStyle,
  heading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: colors.text,
  } satisfies TextStyle,
  subheading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    color: colors.text,
  } satisfies TextStyle,
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    color: colors.text,
  } satisfies TextStyle,
  bodyMuted: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    color: colors.muted,
  } satisfies TextStyle,
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: colors.muted,
  } satisfies TextStyle,
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.subtle,
  } satisfies TextStyle,
} as const;
