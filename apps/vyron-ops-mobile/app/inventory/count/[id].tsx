import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { NumericKeypad } from "@/components/inventory/NumericKeypad";
import { ScanButton } from "@/components/scanner/ScanButton";
import { VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { useStockCountActionMutation, useStockCountSession, useUpdateStockCountLineMutation } from "@/hooks/useStockCounts";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";

function qty(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function CountItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error: loadError, refetch } = useStockCountSession(id);
  const permissions = usePermissions();
  const { session } = useAuth();
  const lineMutation = useUpdateStockCountLineMutation();
  const actionMutation = useStockCountActionMutation();
  const [search, setSearch] = useState("");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [countedValue, setCountedValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const count = data?.count;
  const lines = data?.lines ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter((line) => {
      const description = String(line.vyron_cost_stock_items?.description || "").toLowerCase();
      const code = String(line.vyron_cost_stock_items?.item_code || "").toLowerCase();
      return description.includes(needle) || code.includes(needle);
    });
  }, [lines, search]);

  const activeLine = useMemo(() => {
    if (activeLineId) {
      return lines.find((line) => line.id === activeLineId) || null;
    }
    return filtered[0] || null;
  }, [activeLineId, lines, filtered]);

  const completedLines = useMemo(
    () => lines.filter((line) => Math.abs((line.counted_qty || 0) - (line.system_qty || 0)) > 0.0001).length,
    [lines]
  );
  const progressPct = lines.length > 0 ? Math.round((completedLines / lines.length) * 100) : 0;

  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (loadError || !count) {
    return (
      <VyronEmptyState
        title="Count session unavailable"
        description={loadError instanceof Error ? loadError.message : "Count session not found."}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  if (!activeLine) {
    return (
      <VyronEmptyState
        title="No count lines"
        description="This stock count has no lines."
      />
    );
  }

  const countedQty = qty(countedValue || String(activeLine.counted_qty || 0));
  const difference = countedQty - (activeLine.system_qty || 0);

  const setLineFromScan = (stockItemId: string) => {
    const line = lines.find((row) => row.stock_item_id === stockItemId);
    if (!line) return;
    setActiveLineId(line.id);
    setCountedValue(String(line.counted_qty || line.system_qty || 0));
  };

  const saveLine = async (goNext: boolean) => {
    if (!permissions.data?.canPerformInventoryOperations) {
      setFormError("You do not have permission to update stock counts.");
      return;
    }

    if (countedQty < 0) {
      setFormError("Counted quantity cannot be negative.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await lineMutation.mutateAsync({
        countId: count.id,
        lineId: activeLine.id,
        countedQty,
        actor,
      });
      recordAuditEvent({
        module: "inventory",
        action: "stock_count_line_saved",
        entityType: "stock_count_line",
        entityId: activeLine.id,
        entityLabel: activeLine.vyron_cost_stock_items?.description || activeLine.stock_item_id,
        actorEmail: actor,
        metadata: { countedQty, systemQty: activeLine.system_qty, stockCountId: count.id },
      });
      await scheduleLocalNotification(
        "Stock count line saved",
        `${activeLine.vyron_cost_stock_items?.description || "Item"} updated`
      );

      if (goNext) {
        const idx = filtered.findIndex((line) => line.id === activeLine.id);
        const next = idx >= 0 ? filtered[idx + 1] : null;
        if (next) {
          setActiveLineId(next.id);
          setCountedValue(String(next.counted_qty || next.system_qty || 0));
        }
      }

      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: "start" | "pause" | "resume" | "submit") => {
    setFormError(null);
    try {
      await actionMutation.mutateAsync({ countId: count.id, action, actor });
      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Could not ${action} count.`);
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-2">
          <Text className="text-2xl font-bold text-vyron-text">{count.count_number}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">{count.count_type} · {count.status}</Text>
          <Text className="text-sm font-semibold text-vyron-subtle">Progress {completedLines}/{lines.length} ({progressPct}%)</Text>
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Session controls</Text>
          <View className="flex-row flex-wrap gap-2">
            <VyronButton label="Start" variant="secondary" className="min-h-[48px] px-4" onPress={() => runAction("start")} />
            <VyronButton label="Pause" variant="secondary" className="min-h-[48px] px-4" onPress={() => runAction("pause")} />
            <VyronButton label="Resume" variant="secondary" className="min-h-[48px] px-4" onPress={() => runAction("resume")} />
            <VyronButton label="Submit" className="min-h-[48px] px-4" onPress={() => runAction("submit")} />
          </View>
          {count.status === "Submitted" ? (
            <VyronButton
              label="Open supervisor review"
              variant="ghost"
              onPress={() => router.push(`/inventory/count/review/${count.id}` as Href)}
            />
          ) : null}
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Search and scan</Text>
          <View className="gap-2">
            <Text className="text-xs font-semibold text-vyron-muted">Search by item description or code.</Text>
            <VyronInput label="Search item" value={search} onChangeText={setSearch} placeholder="Description or code" />
            <ScanButton
              workflow="inventory_count"
              context={{ returnPath: `/inventory/count/${count.id}` }}
              onValidated={(result) => {
                if (result.valid && result.matched?.stockItemId) {
                  setLineFromScan(result.matched.stockItemId);
                }
              }}
            />
          </View>
          <View className="max-h-[220px] gap-2">
            {filtered.slice(0, 12).map((line) => {
              const selected = line.id === activeLine.id;
              return (
                <VyronButton
                  key={line.id}
                  label={`${line.vyron_cost_stock_items?.description || line.stock_item_id} (${line.vyron_cost_stock_items?.item_code || ""})`}
                  variant={selected ? "primary" : "secondary"}
                  className="min-h-[48px] px-3"
                  onPress={() => {
                    setActiveLineId(line.id);
                    setCountedValue(String(line.counted_qty || line.system_qty || 0));
                  }}
                />
              );
            })}
          </View>
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-xl font-bold text-vyron-text">{activeLine.vyron_cost_stock_items?.description || "Stock item"}</Text>
          <Text className="text-sm font-semibold text-vyron-muted">SKU {activeLine.vyron_cost_stock_items?.item_code || "N/A"}</Text>
          <Text className="text-lg font-semibold text-vyron-emerald">
            System {activeLine.system_qty} {activeLine.vyron_cost_stock_items?.unit || "unit"}
          </Text>
          <Text className="text-lg font-semibold text-vyron-amber">Difference {difference}</Text>
        </VyronCard>

        <VyronCard className="gap-3">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Counted quantity</Text>
          <Text className="text-4xl font-bold text-vyron-text">{countedValue || "0"}</Text>
          <NumericKeypad value={countedValue} onChange={setCountedValue} />
        </VyronCard>

        {formError ? <Text className="text-base font-semibold text-vyron-rose">{formError}</Text> : null}

        <View className="flex-row gap-2">
          <View className="flex-1">
            <VyronButton label={saving ? "Saving..." : "Save"} onPress={() => saveLine(false)} disabled={saving} />
          </View>
          <View className="flex-1">
            <VyronButton
              label={saving ? "Saving..." : "Save & Next"}
              variant="secondary"
              onPress={() => saveLine(true)}
              disabled={saving}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
