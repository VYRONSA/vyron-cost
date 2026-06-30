import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { NumericKeypad } from "@/components/inventory/NumericKeypad";
import { VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { validateCountedQty } from "@/features/inventory/validation";
import { usePostStockCountMutation, useStockItems } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";

const COUNT_REASONS = ["Cycle Count", "Spot Check", "Recount", "Other"];

export default function CountItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: items, isLoading } = useStockItems();
  const permissions = usePermissions();
  const { session } = useAuth();
  const mutation = usePostStockCountMutation();
  const [countedValue, setCountedValue] = useState("");
  const [reason, setReason] = useState(COUNT_REASONS[0]);
  const [error, setError] = useState<string | null>(null);

  const item = useMemo(() => (items ?? []).find((row) => row.id === id), [items, id]);
  const countedQty = Number(countedValue) || 0;
  const difference = item ? countedQty - item.qty_on_hand : 0;
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  if (isLoading) return <VyronLoading />;
  if (!item) return <VyronEmptyState title="Item not found" description="Stock item could not be loaded." />;

  const saveCount = async () => {
    const validation = validateCountedQty(countedQty);
    if (validation.length) {
      setError(validation[0]?.message ?? "Invalid count.");
      return;
    }
    if (Math.abs(difference) < 0.0001) {
      setError("Counted quantity matches system stock. Adjust the count or skip.");
      return;
    }

    setError(null);
    try {
      await mutation.mutateAsync({
        stock_item_id: item.id,
        counted_qty: countedQty,
        notes: `${reason}`,
        created_by: actor,
      });
      recordAuditEvent({
        module: "inventory",
        action: "stock_count_saved",
        entityType: "stock_item",
        entityId: item.id,
        entityLabel: item.description,
        actorEmail: actor,
        metadata: { countedQty, systemQty: item.qty_on_hand, reason },
      });
      await scheduleLocalNotification("Stock count saved", `${item.description} counted.`);
      router.replace(`/inventory/count/success?item=${encodeURIComponent(item.description)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-2">
          <Text className="text-2xl font-bold text-vyron-text">{item.description}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">SKU {item.item_code}</Text>
          <Text className="text-lg font-semibold text-vyron-emerald">
            System {item.qty_on_hand} {item.unit}
          </Text>
          <Text className="text-lg font-semibold text-vyron-amber">Difference {difference}</Text>
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Counted quantity</Text>
          <Text className="text-4xl font-bold text-vyron-text">{countedValue || "0"}</Text>
          <NumericKeypad value={countedValue} onChange={setCountedValue} />
        </VyronCard>

        <View className="flex-row flex-wrap gap-2">
          {COUNT_REASONS.map((option) => (
            <VyronButton
              key={option}
              label={option}
              variant={reason === option ? "primary" : "secondary"}
              className="min-h-[48px] px-4"
              onPress={() => setReason(option)}
            />
          ))}
        </View>

        {error ? <Text className="text-base font-semibold text-vyron-rose">{error}</Text> : null}

        <VyronButton label="Save count" onPress={saveCount} disabled={mutation.isPending} />
        <VyronButton label="Skip" variant="ghost" onPress={() => router.back()} />
        <VyronButton label="Next item" variant="secondary" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
