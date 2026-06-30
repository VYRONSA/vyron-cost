import { Text, View } from "react-native";
import { VyronCard } from "./Card";
import { VyronBadge } from "./Badge";

type DashboardCardProps = {
  title: string;
  subtitle: string;
  accent: "emerald" | "violet" | "amber" | "rose" | "sky";
};

const accentMap = {
  emerald: "text-vyron-emerald",
  violet: "text-vyron-violet",
  amber: "text-vyron-amber",
  rose: "text-vyron-rose",
  sky: "text-sky-400",
} as const;

export function DashboardPlaceholderCard({ title, subtitle, accent }: DashboardCardProps) {
  return (
    <VyronCard glass className="min-h-[148px] justify-between gap-4">
      <View className="flex-row items-center justify-between">
        <Text className={`text-lg font-bold ${accentMap[accent]}`}>{title}</Text>
        <VyronBadge label="Soon" tone="neutral" />
      </View>
      <Text className="text-sm font-medium text-vyron-muted">{subtitle}</Text>
      <Text className="text-3xl font-bold text-vyron-text">—</Text>
    </VyronCard>
  );
}
