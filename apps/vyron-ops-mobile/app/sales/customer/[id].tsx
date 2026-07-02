import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { VyronBadge, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useMobileCustomerProfile } from "@/hooks/useSales";

function formatMoney(value: number) {
  return `R ${value.toFixed(2)}`;
}

export default function CustomerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useMobileCustomerProfile(id);

  if (isLoading) return <VyronLoading />;
  if (error || !data) {
    return (
      <VyronEmptyState
        title="Customer unavailable"
        description={error instanceof Error ? error.message : "Not found"}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-2">
          <Text className="text-2xl font-bold text-vyron-text">{data.customerName}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">{data.status || "Active"}</Text>
          <View className="flex-row flex-wrap gap-2">
            <VyronBadge label={`Outstanding ${formatMoney(data.outstandingBalance)}`} tone="warning" />
            <VyronBadge
              label={`Credit limit ${data.creditLimit != null ? formatMoney(data.creditLimit) : "Not set"}`}
              tone="info"
            />
          </View>
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Contact details</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Email {data.contactEmail || "N/A"}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Invoice Email {data.invoiceEmail || "N/A"}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Phone {data.phone || "N/A"}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Terms {data.terms || "N/A"}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Assigned Price Sheet {data.assignedPriceSheet || "Default"}</Text>
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Delivery addresses</Text>
          {data.deliveryAddresses.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No delivery addresses captured.</Text>
          ) : (
            data.deliveryAddresses.map((address, index) => (
              <Text key={`${address}-${index}`} className="text-sm font-semibold text-vyron-muted">{address}</Text>
            ))
          )}
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Sales history</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Total sales {formatMoney(data.totalSales)}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">Invoice count {data.invoiceCount}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">
            Average invoice {formatMoney(data.averageInvoiceValue)}
          </Text>
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Last purchases</Text>
          {data.lastPurchases.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No recent purchases.</Text>
          ) : (
            data.lastPurchases.map((purchase) => (
              <View key={purchase.invoiceNumber} className="gap-1 rounded-vyron border border-vyron-border p-3">
                <Text className="text-sm font-bold text-vyron-text">{purchase.invoiceNumber}</Text>
                <Text className="text-xs font-semibold text-vyron-muted">{purchase.date} · {formatMoney(purchase.value)}</Text>
              </View>
            ))
          )}
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Invoices</Text>
          {data.invoices.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No invoices found.</Text>
          ) : (
            data.invoices.slice(0, 20).map((invoice) => (
              <View key={invoice.id} className="gap-1 rounded-vyron border border-vyron-border p-3">
                <Text className="text-sm font-bold text-vyron-text">{invoice.invoice_number}</Text>
                <Text className="text-xs font-semibold text-vyron-muted">{invoice.status} · {formatMoney(invoice.sales_value)}</Text>
              </View>
            ))
          )}
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Sales orders</Text>
          {data.salesOrders.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No open sales orders.</Text>
          ) : (
            data.salesOrders.map((order) => (
              <View key={order.id} className="gap-1 rounded-vyron border border-vyron-border p-3">
                <Text className="text-sm font-bold text-vyron-text">{order.number}</Text>
                <Text className="text-xs font-semibold text-vyron-muted">{order.status} · {formatMoney(order.total)}</Text>
              </View>
            ))
          )}
        </VyronCard>
      </View>
    </ScrollView>
  );
}
