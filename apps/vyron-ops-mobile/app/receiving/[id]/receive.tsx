import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ReceiveLineCard } from "@/components/receiving/ReceiveLineCard";
import { ScanButton } from "@/components/scanner/ScanButton";
import { ScanResultCard } from "@/components/scanner/ScanResultCard";
import { VyronButton, VyronEmptyState, VyronLoading } from "@/components/ui";
import { validateReceiveDraft } from "@/features/receiving/validation";
import { usePurchaseOrderDetail } from "@/hooks/useReceiving";
import { useReceivingDraft } from "@/providers";
import { useScanner } from "@/hooks/useScanner";

export default function ReceiveStockScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, error } = usePurchaseOrderDetail(id);
  const { poId, draft, initDraft, updateLine, receiveFullLine, skipLine, receiveAllFull } = useReceivingDraft();
  const { launchScan } = useScanner();
  const [formError, setFormError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [scanResult, setScanResult] = useState<import("@/types/scanner").ScanValidationResult | null>(null);

  useEffect(() => {
    if (!order?.lines || poId === order.id) return;
    initDraft(order.id, order.lines);
  }, [order, poId, initDraft]);

  if (isLoading) return <VyronLoading />;
  if (error || !order) {
    return (
      <VyronEmptyState
        title="Purchase order unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  const continueToSummary = () => {
    const errors = validateReceiveDraft(draft);
    if (errors.length) {
      setFormError(errors[0]?.message ?? "Check receive quantities.");
      setLineErrors(
        Object.fromEntries(errors.filter((item) => item.lineId).map((item) => [item.lineId!, item.message]))
      );
      return;
    }
    setFormError(null);
    setLineErrors({});
    router.push(`/receiving/${order.id}/confirm`);
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <Text className="text-base font-medium text-vyron-muted">
          Enter quantities for each line. Use quick actions or scan placeholders for faster entry.
        </Text>

        <VyronButton label="Receive all outstanding" variant="secondary" onPress={receiveAllFull} />

        <ScanButton
          workflow="receiving"
          context={{ purchaseOrderId: order.id, returnPath: `/receiving/${order.id}/receive` }}
          onValidated={(result) => {
            setScanResult(result);
            if (result.valid && result.lineId) {
              receiveFullLine(result.lineId);
            }
          }}
        />

        {scanResult ? <ScanResultCard result={scanResult} /> : null}

        {formError ? <Text className="text-base font-semibold text-vyron-rose">{formError}</Text> : null}

        <View className="gap-4">
          {draft.map((line) => (
            <ReceiveLineCard
              key={line.lineId}
              line={line}
              error={lineErrors[line.lineId]}
              onChangeQty={(qty) => updateLine(line.lineId, { receiveQty: qty, skipped: false })}
              onReceiveFull={() => receiveFullLine(line.lineId)}
              onReceivePartial={() => {
                if (line.receiveQty <= 0) {
                  setFormError("Enter a partial quantity first.");
                  return;
                }
                setFormError(null);
              }}
              onSkip={() => skipLine(line.lineId)}
              onScan={() => {
                void launchScan({
                  workflow: "receiving",
                  context: { purchaseOrderId: order.id, lineId: line.lineId, returnPath: `/receiving/${order.id}/receive` },
                }).then((result) => {
                  setScanResult(result);
                  if (result.valid) receiveFullLine(line.lineId);
                });
              }}
            />
          ))}
        </View>

        {draft.length === 0 ? (
          <VyronEmptyState title="Nothing to receive" description="All lines on this purchase order are complete." />
        ) : (
          <VyronButton label="Review summary" onPress={continueToSummary} />
        )}
      </View>
    </ScrollView>
  );
}
