import { Pressable, Text, View } from "react-native";
import { VyronCard } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/DashboardLiveCard";
import type { OpsTask } from "@/types/receiving";

type TaskCardProps = {
  task: OpsTask;
  onPress: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString();
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <VyronCard className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-emerald">{task.title}</Text>
            <Text className="text-2xl font-bold text-vyron-text">{task.poNumber}</Text>
            <Text className="text-base font-medium text-vyron-muted">{task.supplierName}</Text>
          </View>
          <PriorityBadge priority={task.priority} />
        </View>
        <View className="flex-row flex-wrap gap-4">
          <Text className="text-sm font-semibold text-vyron-subtle">Expected {formatDate(task.expectedDate)}</Text>
          <Text className="text-sm font-semibold text-vyron-subtle">Status {task.status}</Text>
          {task.outstandingQty > 0 ? (
            <Text className="text-sm font-semibold text-vyron-amber">Outstanding {task.outstandingQty}</Text>
          ) : null}
        </View>
      </VyronCard>
    </Pressable>
  );
}
