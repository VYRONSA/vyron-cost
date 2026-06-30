import { Text, View } from "react-native";
import { VyronCard } from "@/components/ui";
import type { ScanHistoryEntry } from "@/types/scanner";

export function ScanHistoryPanel({ entries }: { entries: ScanHistoryEntry[] }) {
  if (!entries.length) {
    return (
      <VyronCard>
        <Text className="text-sm font-medium text-vyron-muted">No scans recorded yet.</Text>
      </VyronCard>
    );
  }

  return (
    <View className="gap-3">
      {entries.map((entry) => (
        <VyronCard key={entry.id} className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-vyron-emerald">
              {new Date(entry.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text className="text-xs font-bold uppercase text-vyron-subtle">{entry.status}</Text>
          </View>
          <Text className="text-base font-bold text-vyron-text">{entry.item}</Text>
          <Text className="text-sm font-medium text-vyron-muted">
            {entry.workflow} · {entry.user} · {entry.barcode}
          </Text>
        </VyronCard>
      ))}
    </View>
  );
}
