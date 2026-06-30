import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { canConfirmDelivery } from "@/features/picking/validation";
import { useStoreOrderDetail, useStoreOrderWorkflowMutation } from "@/hooks/useStoreOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth, useDeliveryDraft } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";
import type { DeliveryState } from "@/types/store-orders";

export default function DeliveryConfirmationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: order, isLoading, error } = useStoreOrderDetail(id);
  const workflow = useStoreOrderWorkflowMutation();
  const { draft, initDraft, orderId, setState, setNotes, markSignaturePlaceholder, markPhotoPlaceholder, clearDraft } =
    useDeliveryDraft();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  useEffect(() => {
    if (!order || orderId === order.id) return;
    initDraft(order.id);
  }, [order, orderId, initDraft]);

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !order) {
    return (
      <VyronEmptyState
        title="Store order unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  if (!canConfirmDelivery(order.status)) {
    return (
      <VyronEmptyState
        title="Not ready for delivery confirmation"
        description="Dispatch the order before confirming delivery."
        actionLabel="Back to dispatch"
        onAction={() => router.replace(`/dispatch/${order.id}`)}
      />
    );
  }

  const confirmDelivery = async () => {
    if (!permissions.data?.canDispatchStoreOrders) {
      setSubmitError("You do not have permission to confirm delivery.");
      return;
    }

    setSubmitError(null);
    const note = JSON.stringify({
      source: "vyron-ops-mobile",
      delivery_state: draft.state,
      delivery_notes: draft.notes,
      signature_placeholder: draft.signatureCaptured,
      photo_pod_placeholder: draft.photoCaptured,
    });

    try {
      await workflow.mutateAsync({
        orderId: order.id,
        action: "mark_delivered",
        note,
        actor,
      });
      recordAuditEvent({
        module: "store_orders",
        action: "delivery_confirmed",
        entityType: "store_order",
        entityId: order.id,
        entityLabel: order.order_number,
        actorEmail: actor,
        metadata: { deliveryState: draft.state },
      });
      await scheduleLocalNotification("Order delivered", `Store order ${order.order_number} has been delivered.`);
      clearDraft();
      router.replace(`/dispatch/success?orderNumber=${encodeURIComponent(order.order_number)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Delivery confirmation failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-2">
          <Text className="text-2xl font-bold text-vyron-text">{order.order_number}</Text>
          <Text className="text-base font-medium text-vyron-muted">{order.store_name_snapshot}</Text>
        </VyronCard>

        <View className="flex-row flex-wrap gap-3">
          {(["Delivered", "Partially Delivered"] as DeliveryState[]).map((state) => (
            <VyronButton
              key={state}
              label={state}
              variant={draft.state === state ? "primary" : "secondary"}
              className="flex-1 min-w-[140px]"
              onPress={() => setState(state)}
            />
          ))}
        </View>

        <VyronInput
          label="Delivery notes"
          placeholder="Optional delivery notes"
          value={draft.notes}
          onChangeText={setNotes}
        />

        <View className="flex-row flex-wrap gap-3">
          <VyronButton
            label={draft.signatureCaptured ? "Signature ready" : "Customer signature"}
            variant="ghost"
            className="flex-1 min-w-[160px]"
            onPress={markSignaturePlaceholder}
          />
          <VyronButton
            label={draft.photoCaptured ? "Photo ready" : "Photo POD"}
            variant="ghost"
            className="flex-1 min-w-[160px]"
            onPress={markPhotoPlaceholder}
          />
        </View>

        <Text className="text-sm font-medium text-vyron-muted">
          Signature and photo capture are architecture placeholders for a future sprint.
        </Text>

        {submitError ? <Text className="text-base font-semibold text-vyron-rose">{submitError}</Text> : null}

        <VyronButton
          label={workflow.isPending ? "Confirming…" : "Confirm delivery"}
          onPress={confirmDelivery}
          disabled={workflow.isPending}
        />
      </View>
    </ScrollView>
  );
}
