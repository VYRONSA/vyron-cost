import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScanHistoryPanel } from "@/components/scanner/ScanHistoryPanel";
import { ScanResultCard } from "@/components/scanner/ScanResultCard";
import { ScannerSettingsForm } from "@/components/scanner/ScannerSettingsForm";
import { ScannerViewport, closeScannerInstance, openScannerInstance } from "@/components/scanner/ScannerViewport";
import { VyronButton } from "@/components/ui";
import { useScanner } from "@/hooks/useScanner";
import { usePermissions } from "@/hooks/usePermissions";
import { scannerManager } from "@/platform/scanner-manager";
import { LOCATION_PLACEHOLDERS, QR_ENTITY_PLACEHOLDERS } from "@/types/scanner";

export default function ScannerScreen() {
  const router = useRouter();
  const permissions = usePermissions();
  const { pendingRequest, lastResult, history, stats, settings, patchSettings, scanValue } = useScanner();
  const [manualValue, setManualValue] = useState("");
  const [processing, setProcessing] = useState(false);
  const request = pendingRequest;

  useEffect(() => {
    void openScannerInstance();
    return () => {
      void closeScannerInstance();
    };
  }, []);

  const submitScan = async () => {
    if (!manualValue.trim()) return;
    setProcessing(true);
    try {
      const result = await scanValue(
        manualValue.trim(),
        request?.workflow ?? "general",
        request?.context,
        request?.actorEmail
      );
      if (result.valid && result.routeHint && request?.context?.returnPath) {
        router.push(request.context.returnPath as Href);
      } else if (result.valid && result.routeHint) {
        router.push(result.routeHint as Href);
      }
      setManualValue("");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <View className="gap-2">
          <Text className="text-3xl font-bold text-vyron-text">Scanner</Text>
          <Text className="text-base font-medium text-vyron-muted">
            Enterprise barcode and QR intelligence — one scanner for every workflow.
          </Text>
        </View>

        <ScannerViewport
          request={request}
          manualValue={manualValue}
          onManualValueChange={setManualValue}
          onSubmitManual={submitScan}
          isProcessing={processing}
        />

        {lastResult ? <ScanResultCard result={lastResult} /> : null}

        <View className="flex-row flex-wrap gap-3">
          <StatPill label="Scans today" value={stats.scansToday} />
          <StatPill label="Failed" value={stats.failedScans} />
          <StatPill label="Wrong item" value={stats.wrongItemAttempts} />
          <StatPill label="Verification" value={stats.verificationRate} />
        </View>

        <ScannerSettingsForm settings={settings} onChange={patchSettings} />

        {permissions.data?.canViewScanHistory ? (
          <>
            <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Recent scans</Text>
            <ScanHistoryPanel entries={history} />
          </>
        ) : null}

        <View className="gap-2">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">QR entities (architecture)</Text>
          <Text className="text-sm font-medium text-vyron-muted">{QR_ENTITY_PLACEHOLDERS.join(" · ")}</Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Location verification (architecture)</Text>
          <Text className="text-sm font-medium text-vyron-muted">
            {LOCATION_PLACEHOLDERS.map((row) => row.label).join(" · ")}
          </Text>
        </View>

        {request ? (
          <VyronButton
            label="Cancel scan request"
            variant="ghost"
            onPress={() => {
              scannerManager.clearPendingRequest();
              router.back();
            }}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="rounded-xl border border-vyron-border px-4 py-3">
      <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">{label}</Text>
      <Text className="text-xl font-bold text-vyron-text">{value}</Text>
    </View>
  );
}
