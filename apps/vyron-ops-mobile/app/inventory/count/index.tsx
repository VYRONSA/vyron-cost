import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { StockItemCard } from "@/components/inventory/StockItemCard";
import { ScanButton } from "@/components/scanner/ScanButton";
import { VyronEmptyState, VyronLoading } from "@/components/ui";
import { useStockItems } from "@/hooks/useInventory";

export default function StockCountListScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useStockItems();

  const items = useMemo(() => data ?? [], [data]);

  if (isLoading) return <VyronLoading />;
  if (error) {
    return (
      <VyronEmptyState
        title="Stock count unavailable"
        description={error instanceof Error ? error.message : "Unknown error"}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-4 p-5 pb-12">
        <ScanButton
          workflow="inventory_count"
          context={{ returnPath: "/inventory/count" }}
          onValidated={(result) => {
            if (result.valid && result.matched?.stockItemId) {
              router.push(`/inventory/count/${result.matched.stockItemId}`);
            }
          }}
        />
        {items.map((item) => (
          <StockItemCard
            key={item.id}
            item={item}
            subtitle={`System qty ${item.qty_on_hand} ${item.unit}`}
            onPress={() => router.push(`/inventory/count/${item.id}`)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
