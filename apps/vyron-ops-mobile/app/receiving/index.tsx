import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ReceivingQueueCard } from "@/components/receiving/ReceivingQueueCard";
import { VyronButton, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useReceivingQueue } from "@/hooks/useReceiving";
import { getOrderPriority } from "@/services/tasks/task-engine";

const STATUS_FILTERS = ["All", "Sent", "Partially Received", "Received"] as const;

function outstandingForOrder(order: { lines?: Array<{ outstanding_qty: number }> }) {
  return (order.lines || []).reduce((sum, line) => sum + line.outstanding_qty, 0);
}

export default function ReceivingQueueScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const permissions = usePermissions();
  const { data, isLoading, error, refetch, isRefetching } = useReceivingQueue({ status, search });

  const orders = useMemo(() => data?.orders ?? [], [data?.orders]);

  if (permissions.isLoading) return <VyronLoading />;

  if (!permissions.data?.canReceivePurchaseOrders) {
    return (
      <VyronEmptyState
        title="Receiving not permitted"
        description="Your workspace role does not include goods receiving permissions."
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronInput
          label="Search"
          placeholder="PO number or supplier"
          value={search}
          onChangeText={setSearch}
        />

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

        {!isLoading && !error && orders.length === 0 ? (
          <VyronEmptyState title="No purchase orders" description="Nothing is waiting in the receiving queue." />
        ) : null}

        <View className="gap-4">
          {orders.map((order) => (
            <ReceivingQueueCard
              key={order.id}
              order={order}
              priority={getOrderPriority(order)}
              outstandingQty={order.lines?.length ? outstandingForOrder(order) : null}
              onPress={() => router.push(`/receiving/${order.id}`)}
            />
          ))}
        </View>

        {isRefetching ? <VyronLoading size="small" /> : null}
      </View>
    </ScrollView>
  );
}
