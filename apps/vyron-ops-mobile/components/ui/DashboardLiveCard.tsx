import { Pressable, Text, View } from "react-native";
import { VyronCard } from "./Card";
import { VyronBadge } from "./Badge";
import type { StatusColor } from "@/theme";

type DashboardLiveCardProps = {
  title: string;
  subtitle: string;
  value: string | number;
  accent: "emerald" | "violet" | "amber" | "rose" | "sky";
  loading?: boolean;
  onPress?: () => void;
};

const accentMap = {
  emerald: "text-vyron-emerald",
  violet: "text-vyron-violet",
  amber: "text-vyron-amber",
  rose: "text-vyron-rose",
  sky: "text-sky-400",
} as const;

export function DashboardLiveCard({
  title,
  subtitle,
  value,
  accent,
  loading,
  onPress,
}: DashboardLiveCardProps) {
  const content = (
    <VyronCard glass className="min-h-[148px] justify-between gap-4">
      <View className="flex-row items-center justify-between">
        <Text className={`text-lg font-bold ${accentMap[accent]}`}>{title}</Text>
        <VyronBadge label="Live" tone="success" />
      </View>
      <Text className="text-sm font-medium text-vyron-muted">{subtitle}</Text>
      <Text className="text-3xl font-bold text-vyron-text">{loading ? "…" : value}</Text>
    </VyronCard>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  );
}

export function PriorityBadge({ priority }: { priority: "low" | "normal" | "high" | "urgent" }) {
  const tone: StatusColor =
    priority === "urgent" ? "danger" : priority === "high" ? "warning" : priority === "low" ? "neutral" : "info";
  return <VyronBadge label={priority} tone={tone} />;
}
