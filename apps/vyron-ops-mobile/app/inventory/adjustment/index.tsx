import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { NumericKeypad } from "@/components/inventory/NumericKeypad";
import { VyronButton, VyronCard, VyronLoading } from "@/components/ui";
import { useStockItems } from "@/hooks/useInventory";
import type { AdjustmentReason } from "@/types/inventory";

const REASONS: AdjustmentReason[] = [
  "Damaged",
  "Expired",
  "Lost",
  "Found",
  "Correction",
  "Production Variance",
  "Other",
];

export default function AdjustmentScreen() {
  const router = useRouter();
  const { data: items, isLoading } = useStockItems();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");
  const [reason, setReason] = useState<AdjustmentReason | null>(null);
  const [direction, setDirection] = useState<"add" | "remove">("remove");

  const selected = useMemo(
    () => (items ?? []).find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  if (isLoading) return <VyronLoading />;

  const continueToSummary = () => {
    if (!selected || !reason) return;
    const magnitude = Number(qtyValue) || 0;
    const quantityDelta = direction === "remove" ? -magnitude : magnitude;
    router.push({
      pathname: "/inventory/adjustment/summary",
      params: {
        stockItemId: selected.id,
        itemName: selected.description,
        quantityDelta: String(quantityDelta),
        reason,
        unit: selected.unit,
      },
    });
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <Text className="text-base font-medium text-vyron-muted">Select an item and adjustment reason.</Text>

        <View className="gap-3">
          {(items ?? []).slice(0, 20).map((item) => (
            <VyronButton
              key={item.id}
              label={`${item.description} (${item.qty_on_hand} ${item.unit})`}
              variant={selectedId === item.id ? "primary" : "secondary"}
              onPress={() => setSelectedId(item.id)}
            />
          ))}
        </View>

        {selected ? (
          <>
            <VyronCard className="gap-3">
              <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Adjustment quantity</Text>
              <View className="flex-row gap-3">
                <VyronButton label="Remove" variant={direction === "remove" ? "primary" : "ghost"} onPress={() => setDirection("remove")} className="flex-1" />
                <VyronButton label="Add" variant={direction === "add" ? "primary" : "ghost"} onPress={() => setDirection("add")} className="flex-1" />
              </View>
              <Text className="text-4xl font-bold text-vyron-text">{qtyValue || "0"}</Text>
              <NumericKeypad value={qtyValue} onChange={setQtyValue} />
            </VyronCard>

            <View className="flex-row flex-wrap gap-2">
              {REASONS.map((option) => (
                <VyronButton
                  key={option}
                  label={option}
                  variant={reason === option ? "primary" : "secondary"}
                  className="min-h-[48px] px-3"
                  onPress={() => setReason(option)}
                />
              ))}
            </View>

            <VyronButton label="Review adjustment" onPress={continueToSummary} disabled={!reason || !qtyValue} />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
