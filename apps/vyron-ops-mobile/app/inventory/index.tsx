import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { InventoryTile } from "@/components/inventory/StockItemCard";
import { VyronEmptyState, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";

const tiles = [
  { title: "Stock Lookup", subtitle: "Search ingredients and finished goods", route: "/inventory/lookup" },
  { title: "Stock Count", subtitle: "Tablet-friendly counting workflow", route: "/inventory/count" },
  { title: "Stock Adjustment", subtitle: "Post inventory corrections", route: "/inventory/adjustment" },
  { title: "Stock Transfer", subtitle: "Move stock between locations", route: "/inventory/transfer" },
  { title: "Inventory History", subtitle: "Read-only movement ledger", route: "/inventory/history" },
] as const;

export default function InventoryHomeScreen() {
  const router = useRouter();
  const permissions = usePermissions();

  if (permissions.isLoading) return <VyronLoading />;

  if (!permissions.data?.canPerformInventoryOperations) {
    return (
      <VyronEmptyState
        title="Inventory not permitted"
        description="Your workspace role does not include inventory operations."
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <Text className="text-base font-medium text-vyron-muted">
          Primary inventory workspace for warehouse tablets. All balances and costing remain in VYRON COST.
        </Text>
        <View className="flex-row flex-wrap gap-4">
          {tiles.map((tile) => (
            <InventoryTile
              key={tile.route}
              title={tile.title}
              subtitle={tile.subtitle}
              onPress={() => router.push(tile.route)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
