import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/DashboardLiveCard";
import { VyronBadge } from "@/components/ui/Badge";
import type { ProductionOpsTask } from "@/types/production";

type ProductionTaskCardProps = {
  task: ProductionOpsTask;
  onPress: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function ProductionTaskCard({ task, onPress }: ProductionTaskCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <VyronCard className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-violet">{task.title}</Text>
            <Text className="text-2xl font-bold text-vyron-text">{task.runNumber}</Text>
            <Text className="text-base font-medium text-vyron-muted">{task.productName}</Text>
          </View>
          <PriorityBadge priority={task.priority} />
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <VyronBadge label={task.status} tone="info" />
          <Text className="text-sm font-semibold text-vyron-subtle">
            Planned {task.plannedQty} · Produced {task.producedQty}
          </Text>
          <Text className="text-sm font-semibold text-vyron-subtle">Date {formatDate(task.productionDate)}</Text>
        </View>
      </VyronCard>
    </Pressable>
  );
}
