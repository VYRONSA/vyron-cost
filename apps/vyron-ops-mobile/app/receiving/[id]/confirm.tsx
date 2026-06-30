import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { buildReceiveSummary, toReceiptPayload, validateReceiveDraft } from "@/features/receiving/validation";
import { useConfirmReceiptMutation, usePurchaseOrderDetail } from "@/hooks/useReceiving";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth, useReceivingDraft } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";
import { VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";

export default function ConfirmReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, error } = usePurchaseOrderDetail(id);
  const { draft, clearDraft } = useReceivingDraft();
  const permissions = usePermissions();
  const { session } = useAuth();
  const mutation = useConfirmReceiptMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !order) {
    return (
      <VyronEmptyState
        title="Purchase order unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  const validationErrors = validateReceiveDraft(draft);
  const summary = buildReceiveSummary(draft);

  const confirmReceipt = async () => {
    if (!permissions.data?.canReceivePurchaseOrders) {
      setSubmitError("You do not have permission to confirm receipts.");
      return;
    }
    if (validationErrors.length) {
      setSubmitError(validationErrors[0]?.message ?? "Invalid receipt.");
      return;
    }

    setSubmitError(null);
    const payload = {
      ...toReceiptPayload(draft),
      actor: session?.email || permissions.data?.email || "vyron-ops-mobile",
    };

    try {
      await mutation.mutateAsync({ poId: order.id, payload });
      recordAuditEvent({
        module: "receiving",
        action: "purchase_order_receipt_confirmed",
        entityType: "purchase_order",
        entityId: order.id,
        entityLabel: order.po_number,
        actorEmail: payload.actor,
        metadata: { summary, mode: payload.mode },
      });
      await scheduleLocalNotification(
        "Goods received",
        `Purchase Order ${order.po_number} successfully received.`
      );
      clearDraft();
      router.replace(`/receiving/success?poNumber=${encodeURIComponent(order.po_number)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Receipt failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-4">
          <Text className="text-2xl font-bold text-vyron-text">Receipt summary</Text>
          <SummaryRow label="Total lines" value={String(summary.totalLines)} />
          <SummaryRow label="Total quantity" value={String(summary.totalQuantity)} />
          <SummaryRow label="Outstanding after receipt" value={String(summary.outstandingQuantity)} />
          <SummaryRow label="Estimated value" value={`$${summary.estimatedValue.toFixed(2)}`} />
        </VyronCard>

        <View className="gap-3">
          {draft
            .filter((line) => !line.skipped && line.receiveQty > 0)
            .map((line) => (
              <VyronCard key={line.lineId} className="gap-1">
                <Text className="text-lg font-bold text-vyron-text">{line.ingredientName}</Text>
                <Text className="text-sm font-semibold text-vyron-muted">
                  Receiving {line.receiveQty} {line.unit}
                </Text>
              </VyronCard>
            ))}
        </View>

        {submitError ? <Text className="text-base font-semibold text-vyron-rose">{submitError}</Text> : null}

        <VyronButton
          label={mutation.isPending ? "Confirming…" : "Confirm receipt"}
          onPress={confirmReceipt}
          disabled={mutation.isPending || validationErrors.length > 0}
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
