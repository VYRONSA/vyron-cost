import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { VyronButton, VyronCard, VyronLoading } from "@/components/ui";
import { validateAdjustment } from "@/features/inventory/validation";
import { formatAdjustmentNote } from "@/services/inventory/inventory-api";
import { usePostAdjustmentMutation } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";
import type { AdjustmentReason } from "@/types/inventory";

export default function AdjustmentSummaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    stockItemId: string;
    itemName: string;
    quantityDelta: string;
    reason: AdjustmentReason;
    unit: string;
  }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const mutation = usePostAdjustmentMutation();
  const [error, setError] = useState<string | null>(null);

  const quantityDelta = Number(params.quantityDelta || 0);
  const validation = validateAdjustment({ quantityDelta, reason: params.reason });
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  if (permissions.isLoading) return <VyronLoading />;

  const postAdjustment = async () => {
    if (!permissions.data?.canPostInventoryAdjustments) {
      setError("You do not have permission to post adjustments.");
      return;
    }
    if (validation.length) {
      setError(validation[0]?.message ?? "Invalid adjustment.");
      return;
    }

    setError(null);
    try {
      await mutation.mutateAsync({
        stock_item_id: params.stockItemId,
        quantity_delta: quantityDelta,
        notes: formatAdjustmentNote(params.reason),
        created_by: actor,
      });
      recordAuditEvent({
        module: "inventory",
        action: "inventory_adjustment_posted",
        entityType: "stock_item",
        entityId: params.stockItemId,
        entityLabel: params.itemName,
        actorEmail: actor,
        metadata: { quantityDelta, reason: params.reason },
      });
      await scheduleLocalNotification("Adjustment posted", `${params.itemName} adjusted.`);
      router.replace(`/inventory/adjustment/success?item=${encodeURIComponent(params.itemName)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <Text className="text-2xl font-bold text-vyron-text">Adjustment summary</Text>
          <SummaryRow label="Item" value={params.itemName} />
          <SummaryRow label="Quantity" value={`${quantityDelta} ${params.unit}`} />
          <SummaryRow label="Reason" value={params.reason} />
        </VyronCard>

        {error ? <Text className="text-base font-semibold text-vyron-rose">{error}</Text> : null}

        <VyronButton
          label={mutation.isPending ? "Posting…" : "Post adjustment"}
          onPress={postAdjustment}
          disabled={mutation.isPending || validation.length > 0}
        />
      </View>
    </ScrollView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-base font-medium text-vyron-muted">{label}</Text>
      <Text className="text-lg font-bold text-vyron-text">{value}</Text>
    </View>
  );
}
