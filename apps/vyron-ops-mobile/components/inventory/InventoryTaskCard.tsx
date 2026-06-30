import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/DashboardLiveCard";
import type { InventoryOpsTask } from "@/types/inventory";

type InventoryTaskCardProps = {
  task: InventoryOpsTask;
  onPress: () => void;
};

export function InventoryTaskCard({ task, onPress }: InventoryTaskCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <VyronCard className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-rose">{task.title}</Text>
            <Text className="text-xl font-bold text-vyron-text">{task.stockItemName}</Text>
            <Text className="text-sm font-semibold text-vyron-muted">{task.detail}</Text>
          </View>
          <PriorityBadge priority={task.priority} />
        </View>
      </VyronCard>
    </Pressable>
  );
}
