import { Text, View } from "react-native";
import { VyronButton, VyronCard } from "@/components/ui";
import { useSync } from "@/providers/SyncProvider";
import type { ConflictResolution } from "@/types/sync";

export function ConflictResolverPanel() {
  const sync = useSync();
  if (!sync.conflicts.length) return null;

  return (
    <View className="gap-3">
      <Text className="text-sm font-bold uppercase tracking-widest text-vyron-rose">Sync conflicts</Text>
      {sync.conflicts.map((conflict) => (
        <VyronCard key={conflict.queueId} className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">{conflict.entityLabel}</Text>
          <Text className="text-sm font-medium text-vyron-muted">
            {conflict.workflow} · {conflict.action}
          </Text>
          <Text className="text-sm font-semibold text-vyron-amber">{conflict.serverMessage}</Text>
          <View className="flex-row flex-wrap gap-2">
            {(
              [
                ["Retry", "retry"],
                ["Refresh", "refresh"],
                ["Keep Local", "keep_local"],
                ["Use Server", "use_server"],
              ] as const
            ).map(([label, resolution]) => (
              <VyronButton
                key={resolution}
                label={label}
                variant="secondary"
                className="min-h-[44px] px-3"
                onPress={() => sync.resolveConflict(conflict.queueId, resolution as ConflictResolution)}
              />
            ))}
          </View>
        </VyronCard>
      ))}
    </View>
  );
}
