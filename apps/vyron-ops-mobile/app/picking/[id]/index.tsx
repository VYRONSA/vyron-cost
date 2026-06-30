import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useStoreOrderDetail, useStoreOrderWorkflowMutation } from "@/hooks/useStoreOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { recordAuditEvent } from "@/services/audit/audit-service";
import { useAuth } from "@/providers";

export default function StoreOrderPickingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: order, isLoading, error } = useStoreOrderDetail(id);
  const workflow = useStoreOrderWorkflowMutation();
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !order) {
    return (
      <VyronEmptyState
        title="Store order unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  const startPicking = async () => {
    if (!permissions.data?.canPickStoreOrders) return;
    await workflow.mutateAsync({ orderId: order.id, action: "start_picking", actor });
    recordAuditEvent({
      module: "store_orders",
      action: "picking_started",
      entityType: "store_order",
      entityId: order.id,
      entityLabel: order.order_number,
      actorEmail: actor,
    });
    router.push(`/picking/${order.id}/pick`);
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <Text className="text-3xl font-bold text-vyron-text">{order.order_number}</Text>
          <Text className="text-xl font-semibold text-vyron-muted">{order.store_name_snapshot}</Text>
          <VyronBadge label={order.status} tone="info" />
          {order.notes ? <Text className="text-base font-medium text-vyron-muted">{order.notes}</Text> : null}
        </VyronCard>

        {(order.lines || []).map((line) => (
          <VyronCard key={line.id} className="gap-1">
            <Text className="text-lg font-bold text-vyron-text">{line.product_name_snapshot}</Text>
            <Text className="text-sm font-semibold text-vyron-muted">
              Required {line.quantity} {line.unit}
            </Text>
          </VyronCard>
        ))}

        {order.status === "Approved" ? (
          <VyronButton
            label={workflow.isPending ? "Starting…" : "Start picking"}
            onPress={startPicking}
            disabled={workflow.isPending}
          />
        ) : null}

        {order.status === "Picking" ? (
          <VyronButton label="Continue picking" onPress={() => router.push(`/picking/${order.id}/pick`)} />
        ) : null}
      </View>
    </ScrollView>
  );
}
