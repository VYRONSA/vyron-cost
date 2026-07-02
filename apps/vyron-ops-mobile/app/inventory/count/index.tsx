import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScanButton } from "@/components/scanner/ScanButton";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useCreateStockCountSessionMutation, useStockCountSessions } from "@/hooks/useStockCounts";
import { useAuth } from "@/providers";

const COUNT_TYPES = [
  { label: "Ingredients", value: "ingredients" as const },
  { label: "Packaging", value: "packaging" as const },
  { label: "Finished Goods", value: "finished_goods" as const },
];

function formatType(value: string) {
  return value.replaceAll("_", " ");
}

export default function StockCountListScreen() {
  const router = useRouter();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data, isLoading, error, refetch } = useStockCountSessions();
  const createMutation = useCreateStockCountSessionMutation();
  const [countType, setCountType] = useState<(typeof COUNT_TYPES)[number]["value"]>("finished_goods");
  const [warehouseName, setWarehouseName] = useState("Main Warehouse");
  const [locationName, setLocationName] = useState("Aisle A");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const counts = useMemo(() => data ?? [], [data]);

  if (isLoading || permissions.isLoading) return <VyronLoading />;

  if (!permissions.data?.canPerformInventoryOperations) {
    return (
      <VyronEmptyState
        title="Stock count not permitted"
        description="Your workspace role does not include stock count permissions."
      />
    );
  }

  if (error) {
    return (
      <VyronEmptyState
        title="Stock count unavailable"
        description={error instanceof Error ? error.message : "Unknown error"}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  const createSession = async () => {
    setSubmitError(null);
    try {
      const created = await createMutation.mutateAsync({
        countType,
        createdBy: session?.email || permissions.data?.email || "vyron-ops-mobile",
        actor: session?.email || permissions.data?.email || "vyron-ops-mobile",
        warehouseName: warehouseName.trim() || undefined,
        locationName: locationName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if ((created as { queued?: boolean })?.queued) {
        return;
      }
      const result = created as { count?: { id?: string } };
      if (result.count?.id) {
        router.push(`/inventory/count/${result.count.id}` as Href);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create stock count.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">Create stock count</Text>
          <View className="flex-row flex-wrap gap-2">
            {COUNT_TYPES.map((type) => (
              <VyronButton
                key={type.value}
                label={type.label}
                variant={countType === type.value ? "primary" : "secondary"}
                className="min-h-[48px] px-4"
                onPress={() => setCountType(type.value)}
              />
            ))}
          </View>
          <VyronInput label="Warehouse" value={warehouseName} onChangeText={setWarehouseName} />
          <VyronInput label="Location" value={locationName} onChangeText={setLocationName} />
          <VyronInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional count instructions" multiline />
          {submitError ? <Text className="text-sm font-semibold text-vyron-rose">{submitError}</Text> : null}
          <VyronButton
            label={createMutation.isPending ? "Creating..." : "Create stock count"}
            onPress={createSession}
            disabled={createMutation.isPending}
          />
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">Join existing stock count</Text>
          <ScanButton workflow="inventory_count" context={{ returnPath: "/inventory/count" }} />
          {counts.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No stock count sessions yet.</Text>
          ) : (
            <View className="gap-2">
              {counts.map((count) => (
                <VyronCard key={count.id} className="gap-2 p-3">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1 gap-1">
                      <Text className="text-base font-bold text-vyron-text">{count.count_number}</Text>
                      <Text className="text-xs font-semibold text-vyron-muted">
                        {formatType(count.count_type)} · {count.status}
                      </Text>
                    </View>
                    <VyronBadge label={count.status} tone={count.status === "Submitted" ? "warning" : "info"} />
                  </View>
                  <VyronButton
                    label={count.status === "Submitted" ? "Review for approval" : "Open session"}
                    variant="secondary"
                    className="min-h-[44px]"
                    onPress={() =>
                      router.push(
                        (count.status === "Submitted" ? `/inventory/count/review/${count.id}` : `/inventory/count/${count.id}`) as Href
                      )
                    }
                  />
                </VyronCard>
              ))}
            </View>
          )}
        </VyronCard>
      </View>
    </ScrollView>
  );
}
