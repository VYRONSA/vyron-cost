import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { PickLineCard } from "@/components/picking/PickLineCard";
import { ScanButton } from "@/components/scanner/ScanButton";
import { ScanResultCard } from "@/components/scanner/ScanResultCard";
import { VyronButton, VyronEmptyState, VyronLoading } from "@/components/ui";
import { validatePickDraft } from "@/features/picking/validation";
import { useStoreOrderDetail } from "@/hooks/useStoreOrders";
import { usePickingDraft } from "@/providers";
import type { ShortPickReason } from "@/types/store-orders";

export default function PickOrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, error } = useStoreOrderDetail(id);
  const { orderId, draft, initDraft, pickFullLine, shortPickLine, skipLine, pickAllFull, updateLine } =
    usePickingDraft();
  const [formError, setFormError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [scanResult, setScanResult] = useState<import("@/types/scanner").ScanValidationResult | null>(null);

  useEffect(() => {
    if (!order?.lines || orderId === order.id) return;
    initDraft(order.id, order.lines);
  }, [order, orderId, initDraft]);

  if (isLoading) return <VyronLoading />;
  if (error || !order) {
    return (
      <VyronEmptyState
        title="Store order unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  if (order.status !== "Picking") {
    return (
      <VyronEmptyState
        title="Picking not started"
        description="Start picking from the order detail screen first."
        actionLabel="Back to order"
        onAction={() => router.replace(`/picking/${order.id}`)}
      />
    );
  }

  const continueToSummary = () => {
    const errors = validatePickDraft(draft);
    if (errors.length) {
      setFormError(errors[0]?.message ?? "Check picked quantities.");
      setLineErrors(
        Object.fromEntries(errors.filter((item) => item.lineId).map((item) => [item.lineId!, item.message]))
      );
      return;
    }
    setFormError(null);
    setLineErrors({});
    router.push(`/picking/${order.id}/summary`);
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <Text className="text-base font-medium text-vyron-muted">
          Tap to pick full lines, increment quantities, or record short picks with a reason.
        </Text>

        <VyronButton label="Pick all full" variant="secondary" onPress={pickAllFull} />

        <ScanButton
          workflow="picking"
          context={{ storeOrderId: order.id, returnPath: `/picking/${order.id}/pick` }}
          onValidated={(result) => {
            setScanResult(result);
            if (result.valid && result.lineId) {
              pickFullLine(result.lineId);
            }
          }}
        />

        {scanResult ? <ScanResultCard result={scanResult} /> : null}

        {formError ? <Text className="text-base font-semibold text-vyron-rose">{formError}</Text> : null}

        <View className="gap-4">
          {draft.map((line) => (
            <PickLineCard
              key={line.lineId}
              line={line}
              error={lineErrors[line.lineId]}
              onIncrement={(amount) => {
                const next = Math.min(line.pickedQty + amount, line.requiredQty);
                updateLine(line.lineId, {
                  pickedQty: next,
                  skipped: false,
                  shortPickReason: next < line.requiredQty ? line.shortPickReason : null,
                });
              }}
              onPickFull={() => pickFullLine(line.lineId)}
              onShortPick={(reason: ShortPickReason) => {
                const qty = line.pickedQty > 0 ? line.pickedQty : Math.max(line.requiredQty - 1, 0);
                shortPickLine(line.lineId, qty, reason);
              }}
              onSkip={() => skipLine(line.lineId)}
            />
          ))}
        </View>

        <VyronButton label="Review summary" onPress={continueToSummary} />
      </View>
    </ScrollView>
  );
}
