import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { VyronBadge, VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useStockCountActionMutation, useStockCountSession } from "@/hooks/useStockCounts";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";

function formatMoney(value: number) {
  return `R ${value.toFixed(2)}`;
}

export default function StockCountReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data, isLoading, error, refetch } = useStockCountSession(id);
  const actionMutation = useStockCountActionMutation();
  const [reason, setReason] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const count = data?.count;
  const lines = data?.lines ?? [];
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  const totals = useMemo(() => {
    const systemQty = lines.reduce((sum, line) => sum + Number(line.system_qty || 0), 0);
    const countedQty = lines.reduce((sum, line) => sum + Number(line.counted_qty || 0), 0);
    const varianceQty = countedQty - systemQty;
    const varianceValue = lines.reduce((sum, line) => sum + Math.abs(Number(line.variance_value || 0)), 0);
    return { systemQty, countedQty, varianceQty, varianceValue };
  }, [lines]);

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !count) {
    return (
      <VyronEmptyState
        title="Stock count unavailable"
        description={error instanceof Error ? error.message : "Not found"}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  if (!permissions.data?.canPostInventoryAdjustments && !permissions.data?.canViewSupervisorCommandCentre) {
    return (
      <VyronEmptyState
        title="Supervisor approval required"
        description="Your role does not include stock count approval rights."
      />
    );
  }

  const performAction = async (action: "approve" | "reject" | "request_recount" | "post") => {
    setActionError(null);
    try {
      await actionMutation.mutateAsync({
        countId: count.id,
        action,
        actor,
        approvedBy: actor,
        reason: reason.trim() || undefined,
        overrideNote: overrideNote.trim() || undefined,
      });

      recordAuditEvent({
        module: "inventory",
        action: `stock_count_${action}`,
        entityType: "stock_count",
        entityId: count.id,
        entityLabel: count.count_number,
        actorEmail: actor,
        metadata: {
          reason: reason.trim() || null,
          overrideNote: overrideNote.trim() || null,
          varianceValue: totals.varianceValue,
        },
      });

      if (action === "post") {
        await scheduleLocalNotification(
          "Stock count posted",
          `${count.count_number} posted. Inventory balances updated and ledger transactions created.`
        );
      } else {
        await scheduleLocalNotification("Stock count updated", `${count.count_number} ${action.replaceAll("_", " ")}.`);
      }

      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not ${action} stock count.`);
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-2xl font-bold text-vyron-text">{count.count_number}</Text>
              <Text className="text-sm font-semibold text-vyron-muted">{count.count_type}</Text>
            </View>
            <VyronBadge label={count.status} tone={count.status === "Submitted" ? "warning" : "info"} />
          </View>
        </VyronCard>

        <View className="flex-row flex-wrap gap-3">
          <VyronCard className="min-w-[47%] flex-1 gap-1 p-4">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">System Qty</Text>
            <Text className="text-2xl font-bold text-vyron-text">{totals.systemQty.toFixed(2)}</Text>
          </VyronCard>
          <VyronCard className="min-w-[47%] flex-1 gap-1 p-4">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">Counted Qty</Text>
            <Text className="text-2xl font-bold text-vyron-text">{totals.countedQty.toFixed(2)}</Text>
          </VyronCard>
          <VyronCard className="min-w-[47%] flex-1 gap-1 p-4">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">Variance</Text>
            <Text className="text-2xl font-bold text-vyron-amber">{totals.varianceQty.toFixed(2)}</Text>
          </VyronCard>
          <VyronCard className="min-w-[47%] flex-1 gap-1 p-4">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">Variance Value</Text>
            <Text className="text-2xl font-bold text-vyron-rose">{formatMoney(totals.varianceValue)}</Text>
          </VyronCard>
        </View>

        <VyronCard className="gap-3">
          <Text className="text-lg font-bold text-vyron-text">Supervisor decision</Text>
          <VyronInput label="Reason" placeholder="Reject/recount reason" value={reason} onChangeText={setReason} multiline />
          <VyronInput
            label="Override note"
            placeholder="Mandatory when approving high-variance counts"
            value={overrideNote}
            onChangeText={setOverrideNote}
            multiline
          />

          <View className="gap-2">
            {count.status === "Submitted" || count.status === "Recount Requested" ? (
              <VyronButton
                label={actionMutation.isPending ? "Approving..." : "Approve"}
                onPress={() => performAction("approve")}
                disabled={actionMutation.isPending}
              />
            ) : null}

            {count.status === "Submitted" || count.status === "Recount Requested" ? (
              <VyronButton
                label={actionMutation.isPending ? "Requesting..." : "Request Recount"}
                variant="secondary"
                onPress={() => performAction("request_recount")}
                disabled={actionMutation.isPending}
              />
            ) : null}

            {count.status === "Submitted" || count.status === "Recount Requested" ? (
              <VyronButton
                label={actionMutation.isPending ? "Rejecting..." : "Reject"}
                variant="danger"
                onPress={() => performAction("reject")}
                disabled={actionMutation.isPending}
              />
            ) : null}

            {count.status === "Approved" ? (
              <VyronButton
                label={actionMutation.isPending ? "Posting..." : "Post to inventory"}
                onPress={() => performAction("post")}
                disabled={actionMutation.isPending}
              />
            ) : null}
          </View>

          {actionError ? <Text className="text-sm font-semibold text-vyron-rose">{actionError}</Text> : null}
        </VyronCard>

        <VyronCard className="gap-2">
          <Text className="text-lg font-bold text-vyron-text">Variance lines</Text>
          {lines.length === 0 ? (
            <Text className="text-sm font-semibold text-vyron-muted">No lines in this count.</Text>
          ) : (
            <View className="gap-2">
              {lines.slice(0, 40).map((line) => (
                <VyronCard key={line.id} className="gap-1 p-3">
                  <Text className="text-sm font-bold text-vyron-text">
                    {line.vyron_cost_stock_items?.description || line.stock_item_id}
                  </Text>
                  <Text className="text-xs font-semibold text-vyron-muted">
                    System {line.system_qty} · Counted {line.counted_qty} · Variance {line.variance_qty}
                  </Text>
                  <Text className="text-xs font-semibold text-vyron-subtle">Value {formatMoney(line.variance_value)}</Text>
                </VyronCard>
              ))}
            </View>
          )}
        </VyronCard>
      </View>
    </ScrollView>
  );
}
