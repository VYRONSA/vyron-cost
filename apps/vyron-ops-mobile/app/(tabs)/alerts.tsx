import { type Href, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { PriorityBadge, VyronButton, VyronCard, VyronEmptyState, VyronLoading } from "@/components/ui";
import { useSupervisorNotifications } from "@/hooks/useSupervisorCommandCentre";

export default function AlertsScreen() {
  const router = useRouter();
  const { notifications, isLoading, refetch, unreadCount } = useSupervisorNotifications();

  if (isLoading) return <VyronLoading />;

  const alerts = notifications.filter((item) => item.category === "alert" || item.category === "warning");
  const messages = notifications.filter((item) => item.category === "message");
  const ai = notifications.filter((item) => item.category === "ai");

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-5 p-5 pb-12">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View className="gap-1">
            <Text className="text-2xl font-bold text-vyron-text">Notification Centre</Text>
            <Text className="text-sm font-medium text-vyron-muted">
              {unreadCount} unread operational notifications
            </Text>
          </View>
          <VyronButton label="Refresh" variant="secondary" className="min-h-[48px] px-4" onPress={refetch} />
        </View>

        {!notifications.length ? (
          <VyronEmptyState
            title="No notifications"
            description="Operational alerts, warnings, messages, and AI recommendations appear here."
          />
        ) : null}

        <NotificationSection title="Unread alerts" items={alerts} onPress={(route) => route && router.push(route as Href)} />
        <NotificationSection title="Warnings" items={alerts} onPress={(route) => route && router.push(route as Href)} />
        <NotificationSection title="Operational messages" items={messages} onPress={(route) => route && router.push(route as Href)} />
        <NotificationSection title="AI recommendations" items={ai} onPress={(route) => route && router.push(route as Href)} />
      </View>
    </ScrollView>
  );
}

function NotificationSection({
  title,
  items,
  onPress,
}: {
  title: string;
  items: Array<{
    id: string;
    title: string;
    body: string;
    priority: "low" | "normal" | "high" | "urgent";
    unread: boolean;
    route?: string;
  }>;
  onPress: (route?: string) => void;
}) {
  if (!items.length) return null;
  return (
    <View className="gap-3">
      <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">{title}</Text>
      {items.map((item) => (
        <Pressable key={`${title}-${item.id}`} accessibilityRole="button" onPress={() => onPress(item.route)}>
          <VyronCard className="gap-2">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-base font-bold text-vyron-text">{item.title}</Text>
                <Text className="text-sm font-medium text-vyron-muted">{item.body}</Text>
              </View>
              <PriorityBadge priority={item.priority} />
            </View>
            {item.unread ? <Text className="text-xs font-bold uppercase text-vyron-emerald">Unread</Text> : null}
          </VyronCard>
        </Pressable>
      ))}
    </View>
  );
}
