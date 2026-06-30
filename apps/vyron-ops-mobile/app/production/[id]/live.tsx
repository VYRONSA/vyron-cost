import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { VyronButton, VyronCard, VyronEmptyState, VyronInput, VyronLoading } from "@/components/ui";
import { ScanButton } from "@/components/scanner/ScanButton";
import { ScanResultCard } from "@/components/scanner/ScanResultCard";
import { validateProducedQty, validateWastageEntry } from "@/features/production/validation";
import { useProductionRunDetail } from "@/hooks/useProduction";
import { usePermissions } from "@/hooks/usePermissions";
import { recordAuditEvent } from "@/services/audit/audit-service";
import { useAuth, useProductionDraft } from "@/providers";

export default function LiveProductionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const permissions = usePermissions();
  const { session } = useAuth();
  const { data: run, isLoading, error } = useProductionRunDetail(id);
  const {
    runId,
    producedQty,
    isPaused,
    wastage,
    initDraft,
    incrementGoodUnits,
    setProducedQty,
    pauseRun,
    resumeRun,
    addWastage,
  } = useProductionDraft();
  const [formError, setFormError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<import("@/types/scanner").ScanValidationResult | null>(null);
  const [wasteLine, setWasteLine] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const defaultWasteLine =
    wasteLine || run?.lines?.find((line) => line.line_type === "Ingredient")?.line_name || "";
  const actor = session?.email || permissions.data?.email || "vyron-ops-mobile";

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

  if (run.status !== "In Production") {
    return (
      <VyronEmptyState
        title="Run not active"
        description="Start the production run before recording live output."
        actionLabel="Back to run"
        onAction={() => router.replace(`/production/${run.id}`)}
      />
    );
  }

  const remaining = Math.max(run.planned_qty - producedQty, 0);
  const audit = (action: string, metadata?: Record<string, unknown>) =>
    recordAuditEvent({
      module: "production",
      action,
      entityType: "production_run",
      entityId: run.id,
      entityLabel: run.run_number,
      actorEmail: actor,
      metadata,
    });

  const recordWastage = () => {
    const entry = {
      waste_category: "Ingredient",
      line_name: defaultWasteLine,
      waste_qty: Number(wasteQty) || 0,
      waste_value: 0,
      waste_reason: "Production Error",
    };
    const errors = validateWastageEntry(entry);
    if (errors.length) {
      setFormError(errors[0]?.message ?? "Invalid wastage.");
      return;
    }
    addWastage(entry);
    audit("production_wastage_recorded", { line_name: entry.line_name, waste_qty: entry.waste_qty });
    setWasteQty("");
    setFormError(null);
  };

  const reviewSummary = () => {
    const errors = validateProducedQty(producedQty, run.planned_qty);
    if (errors.length) {
      setFormError(errors[0]?.message ?? "Invalid quantity.");
      return;
    }
    setFormError(null);
    router.push(`/production/${run.id}/summary`);
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <VyronCard className="gap-2">
          <Text className="text-2xl font-bold text-vyron-text">{run.run_number}</Text>
          <Text className="text-base font-medium text-vyron-muted">
            Planned {run.planned_qty} · Produced {producedQty} · Remaining {remaining}
          </Text>
          {isPaused ? <Text className="text-sm font-bold text-vyron-amber">Paused</Text> : null}
        </VyronCard>

        {formError ? <Text className="text-base font-semibold text-vyron-rose">{formError}</Text> : null}

        <ScanButton
          workflow="production"
          context={{ productionRunId: run.id, returnPath: `/production/${run.id}/live` }}
          onValidated={setScanResult}
        />
        {scanResult ? <ScanResultCard result={scanResult} /> : null}

        <View className="flex-row flex-wrap gap-3">
          {run.status === "In Production" && !isPaused ? (
            <>
              <VyronButton label="+1 good unit" className="flex-1 min-w-[140px]" onPress={() => {
                incrementGoodUnits(1);
                audit("production_good_units_recorded", { increment: 1, producedQty: producedQty + 1 });
              }} />
              <VyronButton
                label="+10 good units"
                variant="secondary"
                className="flex-1 min-w-[140px]"
                onPress={() => {
                  incrementGoodUnits(10);
                  audit("production_good_units_recorded", { increment: 10, producedQty: producedQty + 10 });
                }}
              />
              <VyronButton
                label="Pause run"
                variant="ghost"
                className="flex-1 min-w-[140px]"
                onPress={() => {
                  pauseRun();
                  audit("production_run_paused");
                }}
              />
            </>
          ) : null}
          {isPaused ? (
            <VyronButton
              label="Resume run"
              className="flex-1"
              onPress={() => {
                resumeRun();
                audit("production_run_resumed");
              }}
            />
          ) : null}
        </View>

        {!isPaused ? (
          <VyronInput
            label="Produced quantity"
            keyboardType="decimal-pad"
            value={producedQty ? String(producedQty) : ""}
            onChangeText={(text) => setProducedQty(Number(text.replace(/[^0-9.]/g, "")) || 0)}
          />
        ) : null}

        {!isPaused ? (
          <View className="gap-3">
            <Text className="text-lg font-bold text-vyron-text">Record wastage</Text>
            <VyronInput label="Ingredient / line" value={defaultWasteLine} onChangeText={setWasteLine} />
            <VyronInput
              label="Wastage quantity"
              keyboardType="decimal-pad"
              value={wasteQty}
              onChangeText={setWasteQty}
            />
            <VyronButton label="Add wastage" variant="secondary" onPress={recordWastage} />
          </View>
        ) : null}

        {wastage.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Wastage logged</Text>
            {wastage.map((entry) => (
              <VyronCard key={entry.id} className="gap-1">
                <Text className="text-base font-bold text-vyron-text">{entry.line_name}</Text>
                <Text className="text-sm font-semibold text-vyron-muted">{entry.waste_qty} units</Text>
              </VyronCard>
            ))}
          </View>
        ) : null}

        <VyronButton label="Review summary" onPress={reviewSummary} disabled={isPaused} />
      </View>
    </ScrollView>
  );
}
