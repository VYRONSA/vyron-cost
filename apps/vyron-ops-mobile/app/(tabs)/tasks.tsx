import { type Href, useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { InventoryTaskCard } from "@/components/inventory/InventoryTaskCard";
import { ProductionTaskCard } from "@/components/production/ProductionTaskCard";
import { StoreTaskCard } from "@/components/picking/StoreTaskCard";
import { TaskCard } from "@/components/receiving/TaskCard";
import { VyronButton, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useInventoryOpsTasks } from "@/hooks/useInventory";
import { useProductionOpsTasks } from "@/hooks/useProduction";
import { useOpsTasks } from "@/hooks/useReceiving";
import { useStoreOpsTasks } from "@/hooks/useStoreOrders";
import { usePermissions } from "@/hooks/usePermissions";
import type { InventoryOpsTask } from "@/types/inventory";
import type { ProductionOpsTask } from "@/types/production";
import type { OpsTask } from "@/types/receiving";
import type { StoreOpsTask } from "@/types/store-orders";

function productionTaskRoute(task: ProductionOpsTask): Href {
  if (task.type === "start_production_run") return `/production/${task.productionRunId}`;
  if (task.type === "complete_production_run") return `/production/${task.productionRunId}/summary`;
  return `/production/${task.productionRunId}/live`;
}

function storeTaskRoute(task: StoreOpsTask): Href {
  if (task.type === "pick_store_order") return `/picking/${task.storeOrderId}`;
  if (task.type === "resume_picking") return `/picking/${task.storeOrderId}/pick`;
  if (task.type === "dispatch_order") return `/dispatch/${task.storeOrderId}`;
  return `/dispatch/${task.storeOrderId}/deliver`;
}

function inventoryTaskRoute(task: InventoryOpsTask): Href {
  if (task.type === "perform_stock_count") {
    return task.stockItemId ? `/inventory/count/${task.stockItemId}` : "/inventory/count";
  }
  if (task.type === "transfer_stock") return "/inventory/transfer";
  if (task.type === "approve_adjustment") return "/inventory/adjustment";
  if (task.stockItemId) return `/inventory/lookup/${task.stockItemId}`;
  return "/inventory/lookup";
}

export default function TasksScreen() {
  const router = useRouter();
  const permissions = usePermissions();
  const receiving = useOpsTasks();
  const production = useProductionOpsTasks();
  const storeOrders = useStoreOpsTasks();
  const inventory = useInventoryOpsTasks();

  const isLoading =
    permissions.isLoading ||
    receiving.isLoading ||
    production.isLoading ||
    storeOrders.isLoading ||
    inventory.isLoading;
  const error = receiving.error || production.error || storeOrders.error || inventory.error;
  const hasTasks =
    receiving.tasks.length > 0 ||
    production.tasks.length > 0 ||
    storeOrders.tasks.length > 0 ||
    inventory.tasks.length > 0;

  const refetch = () => {
    void receiving.refetch();
    void production.refetch();
    void storeOrders.refetch();
    void inventory.refetch();
  };

  const sortedStoreTasks = useMemo(() => storeOrders.tasks, [storeOrders.tasks]);
  const sortedProductionTasks = useMemo(() => production.tasks, [production.tasks]);
  const sortedReceivingTasks = useMemo(() => receiving.tasks, [receiving.tasks]);
  const sortedInventoryTasks = useMemo(() => inventory.tasks, [inventory.tasks]);

  if (isLoading) return <VyronLoading />;

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <Text className="text-2xl font-bold text-vyron-text">Operational tasks</Text>
          <View className="flex-row flex-wrap gap-2">
            <VyronButton label="Inventory" variant="secondary" className="min-h-[48px] px-4" onPress={() => router.push("/inventory")} />
            <VyronButton label="Picking" variant="secondary" className="min-h-[48px] px-4" onPress={() => router.push("/picking")} />
            <VyronButton label="Dispatch" variant="secondary" className="min-h-[48px] px-4" onPress={() => router.push("/dispatch")} />
            <VyronButton label="Receiving" variant="secondary" className="min-h-[48px] px-4" onPress={() => router.push("/receiving")} />
            <VyronButton label="Production" variant="secondary" className="min-h-[48px] px-4" onPress={() => router.push("/production")} />
          </View>
        </View>

        {error ? (
          <VyronEmptyState
            title="Tasks unavailable"
            description={error instanceof Error ? error.message : "Could not load tasks."}
            actionLabel="Retry"
            onAction={refetch}
          />
        ) : null}

        {!error && !hasTasks ? (
          <VyronEmptyState
            title="No tasks assigned"
            description="Warehouse, factory, and fulfilment tasks appear when operational work is ready."
            actionLabel="Open inventory"
            onAction={() => router.push("/inventory")}
          />
        ) : null}

        {sortedInventoryTasks.length > 0 ? (
          <View className="gap-4">
            <Text className="text-sm font-bold uppercase tracking-widest text-vyron-rose">Inventory</Text>
            {sortedInventoryTasks.map((task) => (
              <InventoryTaskCard key={task.id} task={task} onPress={() => router.push(inventoryTaskRoute(task))} />
            ))}
          </View>
        ) : null}

        {sortedStoreTasks.length > 0 ? (
          <View className="gap-4">
            <Text className="text-sm font-bold uppercase tracking-widest text-sky-400">Store orders</Text>
            {sortedStoreTasks.map((task) => (
              <StoreTaskCard key={task.id} task={task} onPress={() => router.push(storeTaskRoute(task))} />
            ))}
          </View>
        ) : null}

        {sortedProductionTasks.length > 0 ? (
          <View className="gap-4">
            <Text className="text-sm font-bold uppercase tracking-widest text-vyron-violet">Production</Text>
            {sortedProductionTasks.map((task) => (
              <ProductionTaskCard
                key={task.id}
                task={task}
                onPress={() => router.push(productionTaskRoute(task))}
              />
            ))}
          </View>
        ) : null}

        {sortedReceivingTasks.length > 0 ? (
          <View className="gap-4">
            <Text className="text-sm font-bold uppercase tracking-widest text-vyron-emerald">Receiving</Text>
            {sortedReceivingTasks.map((task: OpsTask) => (
              <TaskCard
                key={task.id}
                task={task}
                onPress={() => router.push(`/receiving/${task.purchaseOrderId}/receive` as Href)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
