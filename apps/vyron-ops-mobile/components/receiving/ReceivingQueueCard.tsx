import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/DashboardLiveCard";
import { VyronBadge } from "@/components/ui/Badge";
import type { OpsTaskPriority, PurchaseOrder } from "@/types/receiving";

type ReceivingQueueCardProps = {
  order: PurchaseOrder;
  priority: OpsTaskPriority;
  outstandingQty: number | null;
  onPress: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function ReceivingQueueCard({ order, priority, outstandingQty, onPress }: ReceivingQueueCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <VyronCard className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-bold text-vyron-text">{order.po_number}</Text>
            <Text className="text-lg font-semibold text-vyron-muted">{order.supplier_name}</Text>
          </View>
          <PriorityBadge priority={priority} />
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <VyronBadge label={order.display_status || order.status} tone="info" />
          <Text className="text-sm font-semibold text-vyron-subtle">Expected {formatDate(order.expected_date)}</Text>
          <Text className="text-sm font-semibold text-vyron-amber">
            Outstanding {outstandingQty ?? "—"}
          </Text>
        </View>
      </VyronCard>
    </Pressable>
  );
}
