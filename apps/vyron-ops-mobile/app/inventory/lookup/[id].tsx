import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useInventoryLedger, useLowStockAlerts, useStockItems } from "@/hooks/useInventory";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function StockLookupDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: items, isLoading } = useStockItems();
  const { data: ledger } = useInventoryLedger(id);
  const { data: alerts } = useLowStockAlerts();

  const item = useMemo(() => (items ?? []).find((row) => row.id === id), [items, id]);
  const lastMovement = ledger?.[0] ?? null;
  const isBelowReorder = useMemo(
    () => (alerts ?? []).some((alert) => alert.stock_item_id === id),
    [alerts, id]
  );

  if (isLoading) return <VyronLoading />;
  if (!item) return <VyronEmptyState title="Item not found" description="Stock item could not be loaded." />;

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-4">
          <Text className="text-2xl font-bold text-vyron-text">{item.description}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">SKU {item.item_code}</Text>
          <DetailRow label="Current stock" value={`${item.qty_on_hand} ${item.unit}`} />
          <DetailRow label="Allocated" value="—" />
          <DetailRow label="Available" value={`${item.qty_on_hand} ${item.unit}`} />
          <DetailRow label="Reorder level" value={isBelowReorder ? "Below reorder" : "OK"} />
          <DetailRow label="Warehouse" value="Main warehouse" />
          <DetailRow label="Unit" value={item.unit} />
          <DetailRow label="Last movement" value={formatDate(lastMovement?.created_at ?? null)} />
        </VyronCard>

        <View className="flex-row flex-wrap gap-3">
          <VyronButton label="Stock count" onPress={() => router.push(`/inventory/count/${item.id}`)} />
          <VyronButton
            label="Adjust stock"
            variant="secondary"
            onPress={() => router.push("/inventory/adjustment")}
          />
          <VyronButton
            label="Transfer"
            variant="secondary"
            onPress={() => router.push("/inventory/transfer")}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-t border-vyron-border pt-3">
      <Text className="text-base font-medium text-vyron-muted">{label}</Text>
      <Text className="text-lg font-bold text-vyron-text">{value}</Text>
    </View>
  );
}
