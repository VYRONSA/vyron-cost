import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { DispatchQueueCard } from "@/components/dispatch/DispatchQueueCard";
import { VyronButton, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useDispatchQueue } from "@/hooks/useStoreOrders";
import { getStoreOrderPriority } from "@/services/tasks/store-order-task-engine";

const STATUS_FILTERS = ["All", "ReadyToDispatch", "Dispatched"] as const;

export default function DispatchQueueScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const permissions = usePermissions();
  const { data, isLoading, error, refetch } = useDispatchQueue({ status, search });

  const orders = useMemo(() => data ?? [], [data]);

  if (permissions.isLoading) return <VyronLoading />;

  if (!permissions.data?.canDispatchStoreOrders) {
    return (
      <VyronEmptyState
        title="Dispatch not permitted"
        description="Your workspace role does not include dispatch permissions."
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronInput label="Search" placeholder="Order number or store" value={search} onChangeText={setSearch} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {STATUS_FILTERS.map((filter) => (
              <VyronButton
                key={filter}
                label={filter === "ReadyToDispatch" ? "Ready" : filter}
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
            title="Could not load dispatch queue"
            description={error instanceof Error ? error.message : "Unknown error"}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : null}

        {!isLoading && !error && orders.length === 0 ? (
          <VyronEmptyState title="No dispatch orders" description="Orders ready for dispatch will appear here." />
        ) : null}

        <View className="gap-4">
          {orders.map((order) => (
            <DispatchQueueCard
              key={order.id}
              order={order}
              priority={getStoreOrderPriority(order)}
              onPress={() => router.push(`/dispatch/${order.id}`)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
