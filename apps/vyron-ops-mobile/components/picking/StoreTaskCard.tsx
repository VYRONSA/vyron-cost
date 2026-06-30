import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/DashboardLiveCard";
import { VyronBadge } from "@/components/ui/Badge";
import type { StoreOpsTask } from "@/types/store-orders";

type StoreTaskCardProps = {
  task: StoreOpsTask;
  onPress: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function StoreTaskCard({ task, onPress }: StoreTaskCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <VyronCard className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold uppercase tracking-widest text-sky-400">{task.title}</Text>
            <Text className="text-2xl font-bold text-vyron-text">{task.orderNumber}</Text>
            <Text className="text-base font-medium text-vyron-muted">{task.storeName}</Text>
          </View>
          <PriorityBadge priority={task.priority} />
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <VyronBadge label={task.status} tone="info" />
          <Text className="text-sm font-semibold text-vyron-subtle">Required {formatDate(task.requiredTime)}</Text>
          {task.lineCount > 0 ? (
            <Text className="text-sm font-semibold text-vyron-amber">{task.lineCount} lines</Text>
          ) : null}
        </View>
      </VyronCard>
    </Pressable>
  );
}
