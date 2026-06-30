import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/DashboardLiveCard";
import { VyronBadge } from "@/components/ui/Badge";
import type { StoreOrder } from "@/types/store-orders";
import type { OpsTaskPriority } from "@/types/receiving";

type PickingQueueCardProps = {
  order: StoreOrder;
  priority: OpsTaskPriority;
  lineCount: number | null;
  onPress: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function PickingQueueCard({ order, priority, lineCount, onPress }: PickingQueueCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <VyronCard className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-bold text-vyron-text">{order.order_number}</Text>
            <Text className="text-lg font-semibold text-vyron-muted">
              {order.store_name_snapshot || "Store"}
            </Text>
          </View>
          <PriorityBadge priority={priority} />
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <VyronBadge label={order.status} tone="info" />
          <Text className="text-sm font-semibold text-vyron-subtle">
            Required {formatDate(order.required_date)}
          </Text>
          <Text className="text-sm font-semibold text-vyron-amber">
            Lines {lineCount ?? "—"}
          </Text>
        </View>
      </VyronCard>
    </Pressable>
  );
}
