import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ProductionQueueCard } from "@/components/production/ProductionQueueCard";
import { VyronButton, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useProductionQueue } from "@/hooks/useProduction";
import { getRunPriority } from "@/services/tasks/production-task-engine";

const STATUS_FILTERS = ["All", "Planned", "Approved", "In Production", "Completed"] as const;

export default function ProductionQueueScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const permissions = usePermissions();
  const { data, isLoading, error, refetch } = useProductionQueue({ status, search });

  const runs = useMemo(() => data ?? [], [data]);

  if (permissions.isLoading) return <VyronLoading />;

  if (!permissions.data?.canExecuteProductionRuns && !permissions.data?.canViewAllProductionRuns) {
    return (
      <VyronEmptyState
        title="Production not permitted"
        description="Your workspace role does not include production execution permissions."
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronInput label="Search" placeholder="Run number or product" value={search} onChangeText={setSearch} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
          <View className="flex-row gap-2">
            {STATUS_FILTERS.map((filter) => (
              <VyronButton
                key={filter}
                label={filter}
                variant={status === filter ? "primary" : "secondary"}
                className="min-h-[48px] px-4"
                onPress={() => setStatus(filter)}
              />
            ))}
          </View>
        </ScrollView>

        {isLoading ? <VyronLoading /> : null}
        {error ? (
          <VyronEmptyState
            title="Could not load queue"
            description={error instanceof Error ? error.message : "Unknown error"}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : null}

        {!isLoading && !error && runs.length === 0 ? (
          <VyronEmptyState title="No production runs" description="Nothing is waiting in the production queue." />
        ) : null}

        <View className="gap-4">
          {runs.map((run) => (
            <ProductionQueueCard
              key={run.id}
              run={run}
              priority={getRunPriority(run)}
              onPress={() => router.push(`/production/${run.id}`)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
