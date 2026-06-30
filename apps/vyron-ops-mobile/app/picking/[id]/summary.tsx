import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  buildPickSummary,
  buildPickingNote,
  validatePickDraft,
} from "@/features/picking/validation";
import { useStoreOrderDetail, useStoreOrderWorkflowMutation } from "@/hooks/useStoreOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth, usePickingDraft } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";
import { VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";

export default function PickingSummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: order, isLoading, error } = useStoreOrderDetail(id);
  const { draft, clearDraft, initDraft, orderId } = usePickingDraft();
  const workflow = useStoreOrderWorkflowMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  useEffect(() => {
    if (!order?.lines || orderId === order.id) return;
    initDraft(order.id, order.lines);
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

  const summary = buildPickSummary(draft);
  const validationErrors = validatePickDraft(draft);
  const supervisorNotes = order.change_request_note || order.notes;

  const completePick = async () => {
    if (!permissions.data?.canPickStoreOrders) {
      setSubmitError("You do not have permission to complete picking.");
      return;
    }
    if (validationErrors.length) {
      setSubmitError(validationErrors[0]?.message ?? "Invalid picking summary.");
      return;
    }

    setSubmitError(null);
    try {
      await workflow.mutateAsync({
        orderId: order.id,
        action: "complete_picking",
        note: buildPickingNote(draft),
        actor,
      });
      recordAuditEvent({
        module: "store_orders",
        action: "picking_completed",
        entityType: "store_order",
        entityId: order.id,
        entityLabel: order.order_number,
        actorEmail: actor,
        metadata: { summary },
      });
      await scheduleLocalNotification("Picking completed", `Store order ${order.order_number} is ready for dispatch.`);
      clearDraft();
      router.replace(`/picking/success?orderNumber=${encodeURIComponent(order.order_number)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Complete picking failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-4">
          <Text className="text-2xl font-bold text-vyron-text">Picking summary</Text>
          <SummaryRow label="Total lines" value={String(summary.totalLines)} />
          <SummaryRow label="Picked" value={String(summary.picked)} />
          <SummaryRow label="Outstanding" value={String(summary.outstanding)} />
          <SummaryRow label="Short picked" value={String(summary.shortPicked)} />
          <SummaryRow label="Completion" value={`${summary.completionPct}%`} />
        </VyronCard>

        {supervisorNotes ? (
          <VyronCard className="gap-2">
            <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Supervisor notes</Text>
            <Text className="text-base font-medium text-vyron-muted">{supervisorNotes}</Text>
          </VyronCard>
        ) : null}

        <View className="gap-3">
          {draft
            .filter((line) => !line.skipped && line.pickedQty > 0)
            .map((line) => (
              <VyronCard key={line.lineId} className="gap-1">
                <Text className="text-lg font-bold text-vyron-text">{line.productName}</Text>
                <Text className="text-sm font-semibold text-vyron-muted">
                  Picked {line.pickedQty} of {line.requiredQty}
                  {line.shortPickReason ? ` · ${line.shortPickReason}` : ""}
                </Text>
              </VyronCard>
            ))}
        </View>

        {submitError ? <Text className="text-base font-semibold text-vyron-rose">{submitError}</Text> : null}

        <VyronButton
          label={workflow.isPending ? "Completing…" : "Complete pick"}
          onPress={completePick}
          disabled={workflow.isPending || validationErrors.length > 0}
        />
      </View>
    </ScrollView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-base font-medium text-vyron-muted">{label}</Text>
      <Text className="text-xl font-bold text-vyron-text">{value}</Text>
    </View>
  );
}
