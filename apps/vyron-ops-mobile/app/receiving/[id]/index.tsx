import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { usePurchaseOrderDetail } from "@/hooks/useReceiving";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function PurchaseOrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, error } = usePurchaseOrderDetail(id);

  if (isLoading) return <VyronLoading />;
  if (error || !order) {
    return (
      <VyronEmptyState
        title="Purchase order unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  const lines = order.lines ?? [];
  const receivedLines = lines.filter((line) => line.received_qty > 0);
  const outstandingLines = lines.filter((line) => line.outstanding_qty > 0);

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <Text className="text-3xl font-bold text-vyron-text">{order.po_number}</Text>
          <Text className="text-xl font-semibold text-vyron-muted">{order.supplier_name}</Text>
          <View className="flex-row flex-wrap gap-3">
            <VyronBadge label={order.display_status || order.status} tone="info" />
            <Text className="text-sm font-semibold text-vyron-subtle">Expected {formatDate(order.expected_date)}</Text>
          </View>
          {order.notes ? <Text className="text-base font-medium text-vyron-muted">{order.notes}</Text> : null}
        </VyronCard>

        <Section title="Ordered items" lines={lines} />
        <Section title="Received items" lines={receivedLines} emptyLabel="Nothing received yet." />
        <Section title="Outstanding items" lines={outstandingLines} emptyLabel="Fully received." accent />

        <VyronButton
          label="Start Receiving"
          onPress={() => router.push(`/receiving/${order.id}/receive`)}
          disabled={outstandingLines.length === 0}
        />
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  lines,
  emptyLabel,
  accent,
}: {
  title: string;
  lines: Array<{
    id: string;
    ingredient_name: string;
    quantity: number;
    received_qty: number;
    outstanding_qty: number;
    unit: string;
  }>;
  emptyLabel?: string;
  accent?: boolean;
}) {
  return (
    <View className="gap-3">
      <Text className={`text-lg font-bold ${accent ? "text-vyron-amber" : "text-vyron-text"}`}>{title}</Text>
      {lines.length === 0 ? (
        <Text className="text-sm font-medium text-vyron-muted">{emptyLabel}</Text>
      ) : (
        lines.map((line) => (
          <VyronCard key={line.id} className="gap-2">
            <Text className="text-lg font-bold text-vyron-text">{line.ingredient_name}</Text>
            <Text className="text-sm font-semibold text-vyron-muted">
              Ordered {line.quantity} {line.unit} · Received {line.received_qty} · Outstanding {line.outstanding_qty}
            </Text>
          </VyronCard>
        ))
      )}
    </View>
  );
}
