import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { StockItemCard } from "@/components/inventory/StockItemCard";
import { ScanButton } from "@/components/scanner/ScanButton";
import { ScanResultCard } from "@/components/scanner/ScanResultCard";
import { VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { useStockItems } from "@/hooks/useInventory";
import type { ScanValidationResult } from "@/types/scanner";

export default function StockLookupScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [scanResult, setScanResult] = useState<ScanValidationResult | null>(null);
  const { data, isLoading, error, refetch } = useStockItems();

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = data ?? [];
    if (!term) return rows;
    return rows.filter((item) =>
      [item.description, item.item_code, item.entity_type].join(" ").toLowerCase().includes(term)
    );
  }, [data, search]);

  if (isLoading) return <VyronLoading />;

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronInput
          label="Search"
          placeholder="Ingredient, finished good, SKU"
          value={search}
          onChangeText={setSearch}
        />
        <ScanButton
          workflow="inventory_lookup"
          context={{ returnPath: "/inventory/lookup" }}
          onValidated={(result) => {
            setScanResult(result);
            if (result.valid && result.matched?.stockItemId) {
              router.push(`/inventory/lookup/${result.matched.stockItemId}`);
            }
          }}
        />
        {scanResult ? <ScanResultCard result={scanResult} /> : null}

        {error ? (
          <VyronEmptyState
            title="Lookup unavailable"
            description={error instanceof Error ? error.message : "Unknown error"}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : null}

        {!error && items.length === 0 ? (
          <VyronEmptyState title="No stock items" description="No items match your search." />
        ) : null}

        <View className="gap-4">
          {items.map((item) => (
            <StockItemCard
              key={item.id}
              item={item}
              subtitle={`Available ${item.qty_on_hand} ${item.unit} · Warehouse Main`}
              onPress={() => router.push(`/inventory/lookup/${item.id}`)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
