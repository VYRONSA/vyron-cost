import { Text, View } from "react-native";
import { useSyncOptional } from "@/providers/SyncProvider";

export function NetworkStatusBanner() {
  const sync = useSyncOptional();
  if (!sync) return null;

  const { connectionState, metrics } = sync;
  if (connectionState === "online" && metrics.pendingSyncs === 0) return null;

  const label =
    connectionState === "offline"
      ? "Offline — operations will queue"
      : connectionState === "weak"
        ? "Weak connection"
        : connectionState === "syncing"
          ? `Syncing ${metrics.pendingSyncs} operations…`
          : metrics.pendingSyncs > 0
            ? `${metrics.pendingSyncs} pending syncs`
            : null;

  if (!label) return null;

  const tone =
    connectionState === "offline"
      ? "bg-vyron-rose/20 border-vyron-rose"
      : connectionState === "syncing"
        ? "bg-vyron-violet/20 border-vyron-violet"
        : "bg-vyron-amber/20 border-vyron-amber";

  return (
    <View className={`border-b px-4 py-2 ${tone}`}>
      <Text className="text-center text-sm font-bold text-vyron-text">{label}</Text>
    </View>
  );
}
