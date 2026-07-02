import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Image, ScrollView, Text, View } from "react-native";
import { ScanButton } from "@/components/scanner/ScanButton";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useMobileProductDetail } from "@/hooks/useSales";

function formatMoney(value: number) {
  return `R ${value.toFixed(2)}`;
}

export default function MobileProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useMobileProductDetail({ productId: id });

  if (isLoading) return <VyronLoading />;
  if (error || !data) {
    return (
      <VyronEmptyState
        title="Product unavailable"
        description={error instanceof Error ? error.message : "Not found"}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          {data.imageUrl ? (
            <Image
              source={{ uri: data.imageUrl }}
              style={{ width: "100%", height: 200, borderRadius: 16 }}
              resizeMode="cover"
            />
          ) : null}
          <Text className="text-2xl font-bold text-vyron-text">{data.productName}</Text>
          <View className="flex-row flex-wrap gap-2">
            <VyronBadge label={`Stock ${data.stock}`} tone={data.stock > 0 ? "success" : "danger"} />
            <VyronBadge label={`GP ${data.gpPct.toFixed(1)}%`} tone={data.gpPct < data.targetGp ? "warning" : "success"} />
            <VyronBadge label={data.warning} tone={data.warning.includes("below") ? "warning" : "info"} />
          </View>
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Commercial</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Customer Price {formatMoney(data.customerPrice)}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Selling Price {formatMoney(data.sellingPrice)}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Cost {formatMoney(data.cost)}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Estimated Cost {formatMoney(data.estimatedCost)}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Actual Cost {formatMoney(data.actualCost)}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Target GP {data.targetGp.toFixed(1)}%</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Barcode {data.barcode || "N/A"}</Text>
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">Barcode lookup</Text>
          <ScanButton
            workflow="products"
            context={{ stockItemId: data.id, expectedLabel: data.productName, returnPath: `/sales/product/${data.id}` }}
            onValidated={(result) => {
              if (result.valid && result.matched?.stockItemId) {
                router.replace(`/sales/product/${result.matched.stockItemId}` as Href);
              }
            }}
          />
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Recipe summary</Text>
          {data.recipeSummary.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No BOM recipe linked to this product.</Text>
          ) : (
            data.recipeSummary.map((line, index) => (
              <View key={`${line.item}-${index}`} className="rounded-vyron border border-vyron-border p-3">
                <Text className="text-sm font-bold text-vyron-text">{line.item}</Text>
                <Text className="text-xs font-semibold text-vyron-muted">{line.qty} {line.unit}</Text>
              </View>
            ))
          )}
        </VyronCard>

        <VyronButton
          label="Open sales queue"
          variant="secondary"
          onPress={() => router.push("/sales" as Href)}
        />
      </View>
    </ScrollView>
  );
}
