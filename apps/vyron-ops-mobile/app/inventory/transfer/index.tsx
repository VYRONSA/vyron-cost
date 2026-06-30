import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { NumericKeypad } from "@/components/inventory/NumericKeypad";
import { ScanButton } from "@/components/scanner/ScanButton";
import { ScanResultCard } from "@/components/scanner/ScanResultCard";
import { VyronButton, VyronCard, VyronLoading } from "@/components/ui";
import { validateTransfer } from "@/features/inventory/validation";
import { usePostTransferMutation, useStockItems } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";
import type { TransferDestination } from "@/types/inventory";

const DESTINATIONS: TransferDestination[] = ["Warehouse", "Store", "Production"];

export default function TransferScreen() {
  const router = useRouter();
  const { data: items, isLoading } = useStockItems();
  const permissions = usePermissions();
  const { session } = useAuth();
  const mutation = usePostTransferMutation();
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [destination, setDestination] = useState<TransferDestination>("Warehouse");
  const [qtyValue, setQtyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<import("@/types/scanner").ScanValidationResult | null>(null);

  const fromItem = useMemo(() => (items ?? []).find((item) => item.id === fromId) ?? null, [items, fromId]);
  const toItem = useMemo(() => (items ?? []).find((item) => item.id === toId) ?? null, [items, toId]);
  const quantity = Number(qtyValue) || 0;
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  if (isLoading) return <VyronLoading />;

  const completeTransfer = async () => {
    if (!fromItem || !toItem) return;
    const validation = validateTransfer({
      fromStockItemId: fromItem.id,
      toStockItemId: toItem.id,
      quantity,
      availableQty: fromItem.qty_on_hand,
    });
    if (validation.length) {
      setError(validation[0]?.message ?? "Invalid transfer.");
      return;
    }

    setError(null);
    try {
      await mutation.mutateAsync({
        from_stock_item_id: fromItem.id,
        to_stock_item_id: toItem.id,
        quantity,
        destination,
        notes: `Transfer to ${destination}`,
        created_by: actor,
      });
      recordAuditEvent({
        module: "inventory",
        action: "stock_transfer_completed",
        entityType: "stock_item",
        entityId: fromItem.id,
        entityLabel: fromItem.description,
        actorEmail: actor,
        metadata: { quantity, destination, toItem: toItem.description },
      });
      await scheduleLocalNotification("Transfer completed", `${fromItem.description} transferred.`);
      router.replace(`/inventory/transfer/success?item=${encodeURIComponent(fromItem.description)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <Text className="text-base font-medium text-vyron-muted">Select source and destination stock items.</Text>

        <ScanButton
          workflow="inventory_transfer"
          context={{
            transferStep: fromId ? "destination" : "source",
            stockItemId: fromId ?? undefined,
            returnPath: "/inventory/transfer",
          }}
          label={fromId ? "Scan destination" : "Scan source"}
          onValidated={(result) => {
            setScanResult(result);
            if (!result.valid || !result.matched) return;
            if (!fromId) setFromId(result.matched.stockItemId);
            else setToId(result.matched.stockItemId);
          }}
        />
        {scanResult ? <ScanResultCard result={scanResult} /> : null}

        <View className="gap-2">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">From</Text>
          {(items ?? []).slice(0, 15).map((item) => (
            <VyronButton
              key={`from-${item.id}`}
              label={`${item.description} (${item.qty_on_hand})`}
              variant={fromId === item.id ? "primary" : "secondary"}
              onPress={() => setFromId(item.id)}
            />
          ))}
        </View>

        <View className="gap-2">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">To</Text>
          {(items ?? []).slice(0, 15).map((item) => (
            <VyronButton
              key={`to-${item.id}`}
              label={item.description}
              variant={toId === item.id ? "primary" : "secondary"}
              onPress={() => setToId(item.id)}
            />
          ))}
        </View>

        <View className="flex-row flex-wrap gap-2">
          {DESTINATIONS.map((option) => (
            <VyronButton
              key={option}
              label={option}
              variant={destination === option ? "primary" : "secondary"}
              className="min-h-[48px] px-4"
              onPress={() => setDestination(option)}
            />
          ))}
        </View>

        <VyronCard className="gap-3">
          <Text className="text-4xl font-bold text-vyron-text">{qtyValue || "0"}</Text>
          <NumericKeypad value={qtyValue} onChange={setQtyValue} />
        </VyronCard>

        {error ? <Text className="text-base font-semibold text-vyron-rose">{error}</Text> : null}

        <VyronButton label="Complete transfer" onPress={completeTransfer} disabled={mutation.isPending} />
      </View>
    </ScrollView>
  );
}
