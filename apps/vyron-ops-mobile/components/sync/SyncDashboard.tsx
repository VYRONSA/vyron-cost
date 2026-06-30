import { ScrollView, Text, View } from "react-native";
import { ConflictResolverPanel } from "@/components/sync/ConflictResolverPanel";
import { DashboardLiveCard, VyronButton, VyronCard, VyronLoading } from "@/components/ui";
import { useSync } from "@/providers/SyncProvider";
import { usePermissions } from "@/hooks/usePermissions";

export function SyncDashboard() {
  const sync = useSync();
  const permissions = usePermissions();

  if (permissions.isLoading) return <VyronLoading />;
  if (!permissions.data?.canViewSyncDashboard) {
    return (
      <VyronCard>
        <Text className="text-sm font-medium text-vyron-muted">Supervisor access required.</Text>
      </VyronCard>
    );
  }

  const { metrics, device } = sync;

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <View className="gap-2">
          <Text className="text-3xl font-bold text-vyron-text">Sync Dashboard</Text>
          <Text className="text-base font-medium text-vyron-muted">
            Enterprise offline queue and device health
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-4">
          <MetricCard title="Pending syncs" value={metrics.pendingSyncs} accent="amber" />
          <MetricCard title="Failed syncs" value={metrics.failedSyncs} accent="rose" />
          <MetricCard title="Completed today" value={metrics.completedToday} accent="emerald" />
          <MetricCard title="Avg sync time" value={`${metrics.averageSyncTimeMs}ms`} accent="sky" />
        </View>

        <DashboardLiveCard
          title="Last successful sync"
          subtitle="Most recent completed operation"
          accent="violet"
          value={metrics.lastSuccessfulSync ? new Date(metrics.lastSuccessfulSync).toLocaleString() : "—"}
        />

        <VyronButton label="Sync now" onPress={() => void sync.processQueue()} />
        <VyronButton label="Retry failed" variant="secondary" onPress={() => void sync.retryFailed()} />

        <ConflictResolverPanel />

        <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Device health</Text>
        {device ? (
          <VyronCard className="gap-2">
            <Text className="text-lg font-bold text-vyron-text">{device.friendlyName}</Text>
            <Text className="text-sm font-medium text-vyron-muted">
              {device.platform} · v{device.appVersion} · {device.health}
            </Text>
            <Text className="text-sm font-semibold text-vyron-subtle">Last seen {new Date(device.lastSeen).toLocaleString()}</Text>
          </VyronCard>
        ) : null}

        <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Sync history</Text>
        {sync.history.slice(0, 20).map((entry) => (
          <VyronCard key={entry.id} className="gap-1">
            <Text className="text-base font-bold text-vyron-text">
              {entry.workflow} · {entry.action}
            </Text>
            <Text className="text-sm font-medium text-vyron-muted">
              {new Date(entry.timestamp).toLocaleString()} · {entry.durationMs}ms · {entry.status}
            </Text>
            {entry.error ? <Text className="text-sm font-semibold text-vyron-rose">{entry.error}</Text> : null}
          </VyronCard>
        ))}
      </View>
    </ScrollView>
  );
}

function MetricCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string | number;
  accent: "emerald" | "amber" | "rose" | "sky";
}) {
  return (
    <View className="min-w-[46%] flex-1">
      <DashboardLiveCard title={title} subtitle="Live" accent={accent} value={value} />
    </View>
  );
}
