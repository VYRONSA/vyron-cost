import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { IngredientsPanel } from "@/components/production/IngredientsPanel";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useProductionRunDetail, useProductionShortages, useStartProductionMutation } from "@/hooks/useProduction";
import { usePermissions } from "@/hooks/usePermissions";
import { recordAuditEvent } from "@/services/audit/audit-service";
import { useAuth } from "@/providers";

export default function ProductionRunDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: run, isLoading, error } = useProductionRunDetail(id);
  const { data: shortages = [] } = useProductionShortages(id);
  const startMutation = useStartProductionMutation();

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !run) {
    return (
      <VyronEmptyState
        title="Production run unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  const product = run.product_name_snapshot || run.bom_name_snapshot;
  const remaining = Math.max(run.planned_qty - run.actual_qty, 0);
  const supervisor = run.started_by || run.approved_by || "—";
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  const startRun = async () => {
    if (!permissions.data?.canExecuteProductionRuns) return;
    try {
      await startMutation.mutateAsync({ runId: run.id, actor });
      recordAuditEvent({
        module: "production",
        action: "production_run_started",
        entityType: "production_run",
        entityId: run.id,
        entityLabel: run.run_number,
        actorEmail: actor,
      });
      router.push(`/production/${run.id}/live`);
    } catch {
      // mutation error surfaced via UI if needed
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <Text className="text-3xl font-bold text-vyron-text">{run.run_number}</Text>
          <Text className="text-xl font-semibold text-vyron-muted">{product}</Text>
          <View className="flex-row flex-wrap gap-3">
            <VyronBadge label={run.status} tone="info" />
            <Text className="text-sm font-semibold text-vyron-subtle">Supervisor {supervisor}</Text>
          </View>
        </VyronCard>

        <View className="flex-row flex-wrap gap-3">
          <Metric label="Planned" value={String(run.planned_qty)} />
          <Metric label="Produced" value={String(run.actual_qty)} />
          <Metric label="Remaining" value={String(remaining)} />
        </View>

        {run.notes ? <Text className="text-base font-medium text-vyron-muted">{run.notes}</Text> : null}

        <IngredientsPanel lines={run.lines || []} shortages={shortages} />

        {run.status === "Approved" && permissions.data?.canExecuteProductionRuns ? (
          <VyronButton
            label={startMutation.isPending ? "Starting…" : "Start run"}
            onPress={startRun}
            disabled={startMutation.isPending}
          />
        ) : null}

        {run.status === "In Production" ? (
          <VyronButton label="Continue production" onPress={() => router.push(`/production/${run.id}/live`)} />
        ) : null}

        {["In Production", "Approved"].includes(run.status) ? (
          <VyronButton
            label="Review summary"
            variant="secondary"
            onPress={() => router.push(`/production/${run.id}/summary`)}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <VyronCard className="min-w-[140px] flex-1 gap-1">
      <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">{label}</Text>
      <Text className="text-2xl font-bold text-vyron-text">{value}</Text>
    </VyronCard>
  );
}
