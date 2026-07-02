import { type Href, useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { DashboardLiveCard } from "@/components/ui";
import { useInventoryAlerts, useReceivingQueue } from "@/hooks/useReceiving";
import { useProductionQueue } from "@/hooks/useProduction";
import { usePickingQueue, useStoreOrderStats } from "@/hooks/useStoreOrders";
import { useInventoryStats, useLowStockAlerts } from "@/hooks/useInventory";
import { useSalesInvoices } from "@/hooks/useSales";
import { useTenant } from "@/providers";

function countTodaysReceipts(orders: Array<{ status: string; updated_at?: string | null }>) {
  const today = new Date().toISOString().slice(0, 10);
  return orders.filter(
    (order) =>
      ["Fully Received", "Partially Received"].includes(order.status) &&
      order.updated_at?.slice(0, 10) === today
  ).length;
}

function countProductionRunsToday(runs: Array<{ created_at?: string; started_at?: string | null }>) {
  const today = new Date().toISOString().slice(0, 10);
  return runs.filter(
    (run) => run.created_at?.slice(0, 10) === today || run.started_at?.slice(0, 10) === today
  ).length;
}

export function OperatorHomeDashboard() {
  const { width } = useWindowDimensions();
  const { tenant } = useTenant();
  const router = useRouter();
  const receiving = useReceivingQueue();
  const production = useProductionQueue();
  const storeStats = useStoreOrderStats();
  const pickingQueue = usePickingQueue();
  const inventoryStats = useInventoryStats();
  const salesInvoices = useSalesInvoices({ status: "Draft" });
  const lowStockAlerts = useLowStockAlerts();
  const inventoryAlerts = useInventoryAlerts();
  const columns = width >= 900 ? 2 : 1;

  const stats = receiving.data?.stats;
  const orders = useMemo(() => receiving.data?.orders ?? [], [receiving.data?.orders]);
  const runs = useMemo(() => production.data ?? [], [production.data]);
  const store = storeStats.data;
  const inv = inventoryStats.data;
  const todaysReceipts = useMemo(() => countTodaysReceipts(orders), [orders]);
  const productionRunsToday = useMemo(() => countProductionRunsToday(runs), [runs]);
  const inProgressRuns = useMemo(() => runs.filter((run) => run.status === "In Production").length, [runs]);
  const pickingOrders = useMemo(() => pickingQueue.data ?? [], [pickingQueue.data]);
  const awaitingPicking = useMemo(
    () => pickingOrders.filter((order) => order.status === "Approved").length,
    [pickingOrders]
  );

  const cards = [
    {
      title: "Purchase Orders Awaiting Receipt",
      subtitle: "Open POs ready for receiving",
      accent: "amber" as const,
      value: stats?.openPurchaseOrders ?? "—",
      loading: receiving.isLoading,
      route: "/receiving",
    },
    {
      title: "Production Runs Today",
      subtitle: "Runs scheduled or started today",
      accent: "violet" as const,
      value: production.isLoading ? "…" : productionRunsToday,
      loading: production.isLoading,
      route: "/production",
    },
    {
      title: "Production In Progress",
      subtitle: "Active manufacturing runs",
      accent: "emerald" as const,
      value: production.isLoading ? "…" : inProgressRuns,
      loading: production.isLoading,
      route: "/production",
    },
    {
      title: "Orders Awaiting Picking",
      subtitle: "Approved store orders",
      accent: "sky" as const,
      value: pickingQueue.isLoading ? "…" : awaitingPicking,
      loading: pickingQueue.isLoading,
      route: "/picking",
    },
    {
      title: "Ready for Dispatch",
      subtitle: "Pick-complete orders",
      accent: "amber" as const,
      value: store?.readyForDispatch ?? "—",
      loading: storeStats.isLoading,
      route: "/dispatch",
    },
    {
      title: "Draft Invoices",
      subtitle: "Pending sales invoices",
      accent: "sky" as const,
      value: salesInvoices.isLoading ? "…" : salesInvoices.data?.length ?? "—",
      loading: salesInvoices.isLoading,
      route: "/sales",
    },
    {
      title: "Inventory Alerts",
      subtitle: "Negative stock and shortages",
      accent: "rose" as const,
      value: inv?.negativeStockWarnings ?? inventoryAlerts.data ?? "—",
      loading: inventoryStats.isLoading,
      route: "/inventory",
    },
    {
      title: "Items Below Reorder",
      subtitle: "Low-stock warnings",
      accent: "rose" as const,
      value: lowStockAlerts.data?.length ?? "—",
      loading: lowStockAlerts.isLoading,
      route: "/inventory/lookup",
    },
    {
      title: "Today's Receipts",
      subtitle: "Receipts completed today",
      accent: "violet" as const,
      value: receiving.isLoading ? "…" : todaysReceipts,
      loading: receiving.isLoading,
      route: "/receiving",
    },
  ];

  const typedCards: Array<(typeof cards)[number] & { route: Href }> = cards as Array<
    (typeof cards)[number] & { route: Href }
  >;

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-6 p-5 pb-10">
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-[0.2em] text-vyron-emerald">VYRON OPS</Text>
          <Text className="text-3xl font-bold text-vyron-text">Operations Home</Text>
          <Text className="text-base font-medium text-vyron-muted">
            {tenant.tradingName} · Daily warehouse and factory tasks
          </Text>
        </View>

        <View className={columns === 2 ? "flex-row flex-wrap gap-4" : "gap-4"}>
          {typedCards.map((card) => (
            <View key={card.title} style={{ width: columns === 2 ? "48%" : "100%" }}>
              <DashboardLiveCard
                title={card.title}
                subtitle={card.subtitle}
                accent={card.accent}
                value={card.value}
                loading={card.loading}
                onPress={() => router.push(card.route)}
              />
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
