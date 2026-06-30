import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { ScanButton } from "@/components/scanner/ScanButton";
import { ScanResultCard } from "@/components/scanner/ScanResultCard";
import { canDispatchOrder } from "@/features/picking/validation";
import { useStoreOrderDetail, useStoreOrderWorkflowMutation } from "@/hooks/useStoreOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";

export default function DispatchOrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: order, isLoading, error } = useStoreOrderDetail(id);
  const workflow = useStoreOrderWorkflowMutation();
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<import("@/types/scanner").ScanValidationResult | null>(null);
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  const lineSummary = useMemo(() => order?.lines || [], [order?.lines]);
  const pickedTotal = useMemo(
    () => lineSummary.reduce((sum, line) => sum + line.quantity, 0),
    [lineSummary]
  );

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !order) {
    return (
      <VyronEmptyState
        title="Store order unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  const dispatchOrder = async () => {
    if (!permissions.data?.canDispatchStoreOrders) {
      setSubmitError("You do not have permission to dispatch orders.");
      return;
    }
    if (!canDispatchOrder(order.status)) {
      setSubmitError("Order must complete picking before dispatch.");
      return;
    }

    setSubmitError(null);
    try {
      await workflow.mutateAsync({
        orderId: order.id,
        action: "dispatch",
        note: dispatchNotes.trim() || undefined,
        actor,
      });
      recordAuditEvent({
        module: "store_orders",
        action: "order_dispatched",
        entityType: "store_order",
        entityId: order.id,
        entityLabel: order.order_number,
        actorEmail: actor,
      });
      await scheduleLocalNotification("Order dispatched", `Store order ${order.order_number} has been dispatched.`);
      router.push(`/dispatch/${order.id}/deliver`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Dispatch failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <Text className="text-3xl font-bold text-vyron-text">{order.order_number}</Text>
          <Text className="text-xl font-semibold text-vyron-muted">{order.store_name_snapshot}</Text>
          <Text className="text-sm font-semibold text-vyron-subtle">Status {order.status}</Text>
        </VyronCard>

        <ScanButton
          workflow="dispatch"
          context={{ storeOrderId: order.id, returnPath: `/dispatch/${order.id}` }}
          onValidated={setScanResult}
        />
        {scanResult ? <ScanResultCard result={scanResult} /> : null}

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Order summary</Text>
          <Text className="text-sm font-semibold text-vyron-muted">{lineSummary.length} lines · {pickedTotal} units</Text>
        </VyronCard>

        {lineSummary.map((line) => (
          <VyronCard key={line.id} className="gap-1">
            <Text className="text-lg font-bold text-vyron-text">{line.product_name_snapshot}</Text>
            <Text className="text-sm font-semibold text-vyron-muted">Picked {line.quantity} {line.unit}</Text>
          </VyronCard>
        ))}

        <VyronInput
          label="Dispatch notes"
          placeholder="Optional dispatch instructions"
          value={dispatchNotes}
          onChangeText={setDispatchNotes}
        />

        {submitError ? <Text className="text-base font-semibold text-vyron-rose">{submitError}</Text> : null}

        {order.status === "ReadyToDispatch" ? (
          <VyronButton
            label={workflow.isPending ? "Dispatching…" : "Dispatch order"}
            onPress={dispatchOrder}
            disabled={workflow.isPending}
          />
        ) : null}

        {order.status === "Dispatched" ? (
          <VyronButton label="Confirm delivery" onPress={() => router.push(`/dispatch/${order.id}/deliver`)} />
        ) : null}
      </View>
    </ScrollView>
  );
}
