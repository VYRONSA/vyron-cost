import { ScrollView, Text, View } from "react-native";
import { VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useInventoryLedger } from "@/hooks/useInventory";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function InventoryHistoryScreen() {
  const { data, isLoading, error } = useInventoryLedger();

  if (isLoading) return <VyronLoading />;
  if (error) {
    return (
      <VyronEmptyState
        title="History unavailable"
        description={error instanceof Error ? error.message : "Could not load ledger."}
      />
    );
  }

  const entries = data ?? [];

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-4 p-5 pb-12">
        {entries.length === 0 ? (
          <VyronEmptyState title="No movements" description="Inventory transactions will appear here." />
        ) : (
          entries.map((entry) => (
            <VyronCard key={entry.id} className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-vyron-text">{entry.item_name}</Text>
                <Text className="text-sm font-bold text-vyron-emerald">{entry.transaction_type}</Text>
              </View>
              <Text className="text-sm font-semibold text-vyron-muted">{formatDate(entry.created_at)}</Text>
              <Text className="text-sm font-semibold text-vyron-subtle">
                Qty {entry.signed_quantity} · Balance {entry.running_balance}
              </Text>
              <Text className="text-sm font-medium text-vyron-muted">
                Ref {entry.reference_label || entry.reference_type || "—"} · {entry.created_by || "system"}
              </Text>
            </VyronCard>
          ))
        )}
      </View>
    </ScrollView>
  );
}
