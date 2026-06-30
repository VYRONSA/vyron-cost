import { Text, View } from "react-native";
import { cn } from "@/utils/cn";
import type { StatusColor } from "@/theme";

const toneClasses: Record<StatusColor, string> = {
  success: "bg-emerald-500/15 text-vyron-emerald border-emerald-500/30",
  warning: "bg-amber-500/15 text-vyron-amber border-amber-500/30",
  danger: "bg-rose-500/15 text-vyron-rose border-rose-500/30",
  info: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  neutral: "bg-slate-500/15 text-vyron-muted border-slate-500/30",
};

type VyronBadgeProps = {
  label: string;
  tone?: StatusColor;
  className?: string;
};

export function VyronBadge({ label, tone = "neutral", className }: VyronBadgeProps) {
  return (
    <View className={cn("self-start rounded-full border px-3 py-1", toneClasses[tone], className)}>
      <Text className="text-xs font-bold uppercase tracking-wide">{label}</Text>
    </View>
  );
}
