import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { IngredientsPanel } from "@/components/production/IngredientsPanel";
import {
  buildProductionSummary,
  toCompletePayload,
  validateCompleteProduction,
} from "@/features/production/validation";
import {
  useCompleteProductionMutation,
  useProductionRunDetail,
  useProductionShortages,
} from "@/hooks/useProduction";
import { usePermissions } from "@/hooks/usePermissions";
import { scheduleLocalNotification } from "@/platform/notifications";
import { useAuth, useProductionDraft } from "@/providers";
import { recordAuditEvent } from "@/services/audit/audit-service";
import { VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";

export default function ProductionSummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: run, isLoading, error } = useProductionRunDetail(id);
  const { data: shortages = [] } = useProductionShortages(id);
  const { producedQty, wastage, clearDraft, initDraft, runId } = useProductionDraft();
  const completeMutation = useCompleteProductionMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!run || runId === run.id) return;
    initDraft(run.id, run.actual_qty || 0);
  }, [run, runId, initDraft]);

  if (isLoading || permissions.isLoading) return <VyronLoading />;
  if (error || !run) {
    return (
      <VyronEmptyState
        title="Production run unavailable"
        description={error instanceof Error ? error.message : "Not found"}
      />
    );
  }

  const summary = buildProductionSummary({
    plannedQty: run.planned_qty,
    producedQty,
    wastage,
    estimatedCost: run.planned_cost,
  });
  const validationErrors = validateCompleteProduction(producedQty, wastage);
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

  const completeRun = async () => {
    if (!permissions.data?.canCompleteProductionRuns) {
      setSubmitError("You do not have permission to complete production runs.");
      return;
    }
    if (validationErrors.length) {
      setSubmitError(validationErrors[0]?.message ?? "Invalid production summary.");
      return;
    }

    setSubmitError(null);
    const payload = toCompletePayload(producedQty, wastage, actor);

    try {
      await completeMutation.mutateAsync({ runId: run.id, payload });
      recordAuditEvent({
        module: "production",
        action: "production_run_completed",
        entityType: "production_run",
        entityId: run.id,
        entityLabel: run.run_number,
        actorEmail: actor,
        metadata: { summary },
      });
      await scheduleLocalNotification("Production complete", `Production Run ${run.run_number} completed.`);
      clearDraft();
      router.replace(`/production/success?runNumber=${encodeURIComponent(run.run_number)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Completion failed.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-4">
          <Text className="text-2xl font-bold text-vyron-text">Production summary</Text>
          <SummaryRow label="Planned" value={String(summary.planned)} />
          <SummaryRow label="Produced" value={String(summary.produced)} />
          <SummaryRow label="Remaining" value={String(summary.remaining)} />
          <SummaryRow label="Wastage" value={String(summary.wastage)} />
          <SummaryRow label="Yield %" value={`${summary.yieldPct}%`} />
          <SummaryRow label="Estimated cost" value={`$${summary.estimatedCost.toFixed(2)}`} />
        </VyronCard>

        <IngredientsPanel lines={run.lines || []} shortages={shortages} />

        {submitError ? <Text className="text-base font-semibold text-vyron-rose">{submitError}</Text> : null}

        <VyronButton
          label={completeMutation.isPending ? "Completing…" : "Complete run"}
          onPress={completeRun}
          disabled={completeMutation.isPending || validationErrors.length > 0}
        />
      </View>
    </ScrollView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-base font-medium text-vyron-muted">{label}</Text>
      <Text className="text-xl font-bold text-vyron-text">{value}</Text>
    </View>
  );
}
