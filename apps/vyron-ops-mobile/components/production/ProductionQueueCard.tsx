import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/DashboardLiveCard";
import { VyronBadge } from "@/components/ui/Badge";
import type { ProductionRun } from "@/types/production";
import type { OpsTaskPriority } from "@/types/receiving";

type ProductionQueueCardProps = {
  run: ProductionRun;
  priority: OpsTaskPriority;
  onPress: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function ProductionQueueCard({ run, priority, onPress }: ProductionQueueCardProps) {
  const product = run.product_name_snapshot || run.bom_name_snapshot;
  const productionDate = run.started_at || run.created_at;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <VyronCard className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-bold text-vyron-text">{run.run_number}</Text>
            <Text className="text-lg font-semibold text-vyron-muted">{product}</Text>
          </View>
          <PriorityBadge priority={priority} />
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <VyronBadge label={run.status} tone="info" />
          <Text className="text-sm font-semibold text-vyron-subtle">Required {run.planned_qty}</Text>
          <Text className="text-sm font-semibold text-vyron-emerald">Produced {run.actual_qty}</Text>
          <Text className="text-sm font-semibold text-vyron-subtle">{formatDate(productionDate)}</Text>
        </View>
      </VyronCard>
    </Pressable>
  );
}
