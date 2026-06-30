import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { VyronButton, VyronCard } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth, useTenant } from "@/providers";
import { appConfig } from "@/utils/config";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { tenant } = useTenant();
  const permissions = usePermissions();
  const router = useRouter();

  return (
    <View className="flex-1 gap-5 bg-vyron-bg p-5">
      <Text className="text-3xl font-bold text-vyron-text">Profile</Text>

      <VyronCard glass className="gap-4">
        <ProfileRow label="User" value={session?.email ?? "Operations User"} />
        <ProfileRow label="Workspace" value={tenant.workspaceId ?? "Not connected"} />
        <ProfileRow label="Company" value={tenant.tradingName} />
        <ProfileRow label="Package" value={tenant.packageName} />
        <ProfileRow label="App version" value={appConfig.version} />
      </VyronCard>

      {permissions.data?.canViewSyncDashboard ? (
        <VyronButton label="Sync dashboard" variant="secondary" onPress={() => router.push("/sync")} />
      ) : null}

      <VyronButton label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </View>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1 border-b border-vyron-border pb-3">
      <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">{label}</Text>
      <Text className="text-base font-semibold text-vyron-text">{value}</Text>
    </View>
  );
}
