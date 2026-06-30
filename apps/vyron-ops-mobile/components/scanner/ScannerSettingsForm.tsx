import { Text, View } from "react-native";
import { VyronButton } from "@/components/ui";
import type { ScannerSettings } from "@/types/scanner";

type ScannerSettingsFormProps = {
  settings: ScannerSettings;
  onChange: (patch: Partial<ScannerSettings>) => void;
};

function ToggleRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <VyronButton
      label={`${label}: ${active ? "On" : "Off"}`}
      variant={active ? "primary" : "secondary"}
      className="min-h-[48px]"
      onPress={onPress}
    />
  );
}

export function ScannerSettingsForm({ settings, onChange }: ScannerSettingsFormProps) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">Scanner settings</Text>
      <ToggleRow
        label="Torch"
        active={settings.torchEnabled}
        onPress={() => onChange({ torchEnabled: !settings.torchEnabled })}
      />
      <ToggleRow
        label="Sound"
        active={settings.soundEnabled}
        onPress={() => onChange({ soundEnabled: !settings.soundEnabled })}
      />
      <ToggleRow
        label="Vibration"
        active={settings.vibrationEnabled}
        onPress={() => onChange({ vibrationEnabled: !settings.vibrationEnabled })}
      />
      <ToggleRow
        label="Hardware scanner"
        active={settings.hardwareScannerEnabled}
        onPress={() => onChange({ hardwareScannerEnabled: !settings.hardwareScannerEnabled })}
      />
      <ToggleRow
        label="Batch mode (architecture)"
        active={settings.batchModeEnabled}
        onPress={() => onChange({ batchModeEnabled: !settings.batchModeEnabled })}
      />
      <View className="flex-row flex-wrap gap-2">
        {(["low", "normal", "high"] as const).map((level) => (
          <VyronButton
            key={level}
            label={`Sensitivity ${level}`}
            variant={settings.sensitivity === level ? "primary" : "ghost"}
            className="min-h-[44px] px-3"
            onPress={() => onChange({ sensitivity: level })}
          />
        ))}
      </View>
      <View className="flex-row gap-2">
        <VyronButton
          label="Camera back"
          variant={settings.cameraFacing === "back" ? "primary" : "secondary"}
          className="flex-1"
          onPress={() => onChange({ cameraFacing: "back" })}
        />
        <VyronButton
          label="Camera front"
          variant={settings.cameraFacing === "front" ? "primary" : "secondary"}
          className="flex-1"
          onPress={() => onChange({ cameraFacing: "front" })}
        />
      </View>
    </View>
  );
}
