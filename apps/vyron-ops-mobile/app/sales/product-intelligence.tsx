import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { ScanButton } from "@/components/scanner/ScanButton";
import { VyronBadge, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useMobileProductIntelligence } from "@/hooks/useSales";

function formatMoney(value: number) {
  return `R ${value.toFixed(2)}`;
}

export default function MobileProductIntelligenceScreen() {
  const router = useRouter();
  const permissions = usePermissions();
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } = useMobileProductIntelligence();

  const rows = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.productName.toLowerCase().includes(needle));
  }, [rows, search]);

  if (permissions.isLoading || isLoading) return <VyronLoading />;

  if (!permissions.data?.canViewProductGp) {
    return (
      <VyronEmptyState
        title="Margin intelligence not permitted"
        description="Your role does not include gross-profit visibility."
      />
    );
  }

  if (error) {
    return (
      <VyronEmptyState
        title="Could not load product intelligence"
        description={error instanceof Error ? error.message : "Unknown error"}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <ScanButton
          label="Scan product barcode"
          workflow="products"
          context={{ returnPath: "/sales/product-intelligence" }}
          onValidated={(result) => {
            if (result.valid && result.matched?.stockItemId) {
              router.push(`/sales/product/${result.matched.stockItemId}` as Href);
            }
          }}
        />

        <VyronInput
          label="Search products"
          placeholder="Product name"
          value={search}
          onChangeText={setSearch}
        />

        <View className="gap-3">
          {filtered.map((row) => (
            <VyronCard key={row.id} className="gap-2">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-vyron-text">{row.productName}</Text>
                  <Text className="text-xs font-semibold text-vyron-muted">{row.category}</Text>
                </View>
                <VyronBadge
                  label={row.gpPct < row.targetGp ? "Below target" : "On target"}
                  tone={row.gpPct < row.targetGp ? "warning" : "success"}
                />
              </View>

              <View className="flex-row flex-wrap gap-3">
                <Text className="text-xs font-semibold text-vyron-subtle">Price {formatMoney(row.customerPrice)}</Text>
                <Text className="text-xs font-semibold text-vyron-subtle">Cost {formatMoney(row.actualCost)}</Text>
                <Text className="text-xs font-semibold text-vyron-subtle">GP {row.gpPct.toFixed(1)}%</Text>
                <Text className="text-xs font-semibold text-vyron-subtle">Target {row.targetGp.toFixed(1)}%</Text>
                <Text className="text-xs font-semibold text-vyron-subtle">Stock {row.stock}</Text>
              </View>

              <Text
                className="text-xs font-bold uppercase tracking-widest text-vyron-emerald"
                onPress={() => router.push(`/sales/product/${row.productId}` as Href)}
              >
                Open Detail
              </Text>
            </VyronCard>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
