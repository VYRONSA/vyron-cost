import { Text, View } from "react-native";
import { VyronButton, VyronCard, VyronInput } from "@/components/ui";
import { scannerManager } from "@/platform/scanner-manager";
import type { ScanRequest } from "@/platform/scanner-manager";

type ScannerViewportProps = {
  request: ScanRequest | null;
  manualValue: string;
  onManualValueChange: (value: string) => void;
  onSubmitManual: () => void;
  isProcessing?: boolean;
};

export function ScannerViewport({
  request,
  manualValue,
  onManualValueChange,
  onSubmitManual,
  isProcessing,
}: ScannerViewportProps) {
  return (
    <VyronCard glass className="min-h-[320px] justify-between gap-4">
      <View className="items-center gap-2">
        <Text className="text-lg font-bold text-vyron-text">Scanner viewport</Text>
        <Text className="text-center text-sm font-medium text-vyron-muted">
          Camera and hardware adapters share this single scanner instance.
          {request?.title ? ` · ${request.title}` : ""}
        </Text>
      </View>

      <View className="items-center rounded-2xl border border-dashed border-vyron-border px-6 py-10">
        <Text className="text-base font-semibold text-vyron-subtle">EAN-13 · Code128 · UPC · QR</Text>
        <Text className="mt-2 text-sm font-medium text-vyron-muted">RFID ready · Hardware wedge ready</Text>
      </View>

      <VyronInput
        label="Manual / simulated barcode"
        placeholder="Enter or simulate barcode"
        value={manualValue}
        onChangeText={onManualValueChange}
      />

      <VyronButton
        label={isProcessing ? "Validating…" : "Validate scan"}
        onPress={onSubmitManual}
        disabled={isProcessing || !manualValue.trim()}
      />
    </VyronCard>
  );
}

export async function openScannerInstance() {
  await scannerManager.open();
}

export async function closeScannerInstance() {
  await scannerManager.close();
}
