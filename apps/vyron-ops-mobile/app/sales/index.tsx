import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useSalesInvoices } from "@/hooks/useSales";

const STATUS_FILTERS = ["All", "Draft", "Approved", "Sent", "Paid", "Cancelled"] as const;

function toneForStatus(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Cancelled") return "danger" as const;
  if (status === "Draft") return "warning" as const;
  return "info" as const;
}

function formatMoney(value: number) {
  return `R ${value.toFixed(2)}`;
}

export default function SalesHomeScreen() {
  const router = useRouter();
  const permissions = usePermissions();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch } = useSalesInvoices({ status, search });

  const invoices = useMemo(() => data ?? [], [data]);
  const draftCount = useMemo(() => invoices.filter((row) => row.status === "Draft").length, [invoices]);

  if (permissions.isLoading) return <VyronLoading />;

  if (!permissions.data?.canCreateSalesOrders && !permissions.data?.canConvertSalesOrderToInvoice) {
    return (
      <VyronEmptyState
        title="Sales not permitted"
        description="Your workspace role does not include mobile sales and invoice permissions."
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-2">
          <Text className="text-2xl font-bold text-vyron-text">Sales queue</Text>
          <Text className="text-sm font-semibold text-vyron-muted">
            Manage draft invoices, customer billing flow, and post-approval execution.
          </Text>
          <Text className="text-sm font-semibold text-vyron-subtle">Draft invoices: {draftCount}</Text>
        </VyronCard>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <VyronButton label="New invoice" onPress={() => router.push("/sales/new" as Href)} />
          </View>
          {permissions.data?.canViewProductGp ? (
            <View className="flex-1">
              <VyronButton
                label="Product intelligence"
                variant="secondary"
                onPress={() => router.push("/sales/product-intelligence" as Href)}
              />
            </View>
          ) : null}
        </View>

        <VyronInput
          label="Search"
          placeholder="Invoice number or customer"
          value={search}
          onChangeText={setSearch}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {STATUS_FILTERS.map((filter) => (
              <VyronButton
                key={filter}
                label={filter}
                variant={status === filter ? "primary" : "secondary"}
                className="min-h-[48px] px-4"
                onPress={() => setStatus(filter)}
              />
            ))}
          </View>
        </ScrollView>

        {isLoading ? <VyronLoading /> : null}
        {error ? (
          <VyronEmptyState
            title="Could not load sales queue"
            description={error instanceof Error ? error.message : "Unknown error"}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : null}

        {!isLoading && !error && invoices.length === 0 ? (
          <VyronEmptyState
            title="No invoices"
            description="Create a draft invoice to start the mobile sales flow."
            actionLabel="Create invoice"
            onAction={() => router.push("/sales/new" as Href)}
          />
        ) : null}

        <View className="gap-4">
          {invoices.map((invoice) => (
            <VyronCard key={invoice.id} className="gap-3">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1 gap-1">
                  <Text className="text-xl font-bold text-vyron-text">{invoice.invoice_number}</Text>
                  <Text className="text-sm font-semibold text-vyron-muted">{invoice.customer_name}</Text>
                </View>
                <VyronBadge label={invoice.status} tone={toneForStatus(invoice.status)} />
              </View>

              <View className="flex-row flex-wrap gap-4">
                <Text className="text-sm font-semibold text-vyron-subtle">Sales {formatMoney(invoice.sales_value)}</Text>
                {permissions.data?.canViewProductGp ? (
                  <Text className="text-sm font-semibold text-vyron-subtle">GP {invoice.gp_percentage.toFixed(1)}%</Text>
                ) : null}
              </View>

              <VyronButton
                label="Open invoice"
                variant="secondary"
                className="min-h-[48px]"
                onPress={() => router.push(`/sales/${invoice.id}` as Href)}
              />
                {invoice.customer_id ? (
                  <VyronButton
                    label="Customer profile"
                    variant="ghost"
                    className="min-h-[44px]"
                    onPress={() => router.push(`/sales/customer/${invoice.customer_id}` as Href)}
                  />
                ) : null}
            </VyronCard>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
