import type { ReactNode } from "react";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { DashboardLiveCard, PriorityBadge, VyronButton, VyronCard, VyronLoading } from "@/components/ui";
import { useSupervisorCommandCentre } from "@/hooks/useSupervisorCommandCentre";
import { formatSupervisorClock, formatSupervisorDate } from "@/platform/shift";
import { useTenant } from "@/providers";
import type { OperationalActivityEvent, OperationalAiAlert, SupervisorAggregatedTask } from "@/types/supervisor";

export function SupervisorCommandCentre() {
  const router = useRouter();
  const { tenant } = useTenant();
  const { width } = useWindowDimensions();
  const centre = useSupervisorCommandCentre();
  const [now, setNow] = useState(new Date());
  const columns = width >= 900 ? 2 : 1;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (centre.isLoading) return <VyronLoading />;

  return (
    <ScrollView className="flex-1 bg-vyron-bg">
      <View className="gap-6 p-5 pb-12">
        <View className="gap-3">
          <Text className="text-xs font-bold uppercase tracking-[0.2em] text-vyron-emerald">VYRON OPS</Text>
          <Text className="text-3xl font-bold text-vyron-text">Supervisor Command Centre</Text>
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <View className="gap-1">
              <Text className="text-2xl font-bold text-vyron-text">{formatSupervisorClock(now)}</Text>
              <Text className="text-sm font-semibold text-vyron-muted">{formatSupervisorDate(now)}</Text>
              <Text className="text-sm font-medium text-vyron-subtle">
                {centre.currentShift} · {tenant.tradingName} · {tenant.companyName}
              </Text>
            </View>
            <VyronButton label="Refresh" variant="secondary" className="min-h-[48px] px-5" onPress={centre.refetchAll} />
          </View>
        </View>

        <Section title="Live KPI grid">
          <View className={columns === 2 ? "flex-row flex-wrap gap-4" : "gap-4"}>
            {centre.kpis.map((kpi) => (
              <View key={kpi.id} style={{ width: columns === 2 ? "48%" : "100%" }}>
                <DashboardLiveCard
                  title={kpi.title}
                  subtitle={kpi.subtitle}
                  accent={kpi.accent}
                  value={kpi.value}
                  loading={kpi.loading}
                  onPress={() => router.push(kpi.route as Href)}
                />
              </View>
            ))}
          </View>
        </Section>

        <Section title="Quick actions">
          <View className="flex-row flex-wrap gap-3">
            {quickActions.map((action) => (
              <VyronButton
                key={action.label}
                label={action.label}
                variant="secondary"
                className="min-h-[56px] min-w-[46%] flex-1 px-3"
                onPress={() => router.push(action.route)}
              />
            ))}
          </View>
        </Section>

        <View className={columns === 2 ? "flex-row gap-4" : "gap-4"}>
          <View className="flex-1">
            <Section title="Live activity feed">
              <ActivityFeed events={centre.activity} onPress={(route) => route && router.push(route as Href)} />
            </Section>
          </View>
          <View className="flex-1">
            <Section title="AI operational alerts">
              <AiAlertsPanel alerts={centre.aiAlerts} onPress={(route) => router.push(route as Href)} />
            </Section>
          </View>
        </View>

        <Section title="Today's tasks">
          <TasksPanel tasks={centre.tasks} onPress={(route) => router.push(route as Href)} />
        </Section>

        <Section title="Shift dashboard">
          <View className="gap-3">
            {centre.shifts.map((shift) => (
              <VyronCard key={shift.shift} className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-bold text-vyron-text">{shift.shift}</Text>
                  {shift.isCurrent ? <Text className="text-xs font-bold uppercase text-vyron-emerald">Current</Text> : null}
                </View>
                <Text className="text-sm font-medium text-vyron-muted">
                  Production {shift.metrics.production} · Receiving {shift.metrics.receiving} · Picking{" "}
                  {shift.metrics.picking} · Dispatch {shift.metrics.dispatch} · Counts {shift.metrics.counts}
                </Text>
              </VyronCard>
            ))}
          </View>
        </Section>

        <View className={columns === 2 ? "flex-row gap-4" : "gap-4"}>
          <View className="flex-1">
            <Section title="Staff status">
              <View className="gap-3">
                {centre.staff.map((row) => (
                  <VyronCard key={row.id} className="flex-row items-center justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-base font-bold text-vyron-text">{row.team}</Text>
                      <Text className="text-sm font-medium text-vyron-muted">{row.detail}</Text>
                    </View>
                    <Text
                      className={
                        row.status === "Busy"
                          ? "text-sm font-bold text-vyron-amber"
                          : row.status === "Available"
                            ? "text-sm font-bold text-vyron-emerald"
                            : "text-sm font-bold text-vyron-muted"
                      }
                    >
                      {row.status}
                    </Text>
                  </VyronCard>
                ))}
              </View>
            </Section>
          </View>
          <View className="flex-1">
            <Section title="Equipment status">
              <View className="gap-3">
                {centre.equipment.map((item) => (
                  <VyronCard key={item.id} className="gap-1">
                    <Text className="text-base font-bold text-vyron-text">{item.name}</Text>
                    <Text className="text-sm font-medium text-vyron-muted">{item.detail}</Text>
                    <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">{item.status}</Text>
                  </VyronCard>
                ))}
              </View>
            </Section>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const quickActions: ReadonlyArray<{ label: string; route: Href }> = [
  { label: "Receive Stock", route: "/receiving" },
  { label: "Production Queue", route: "/production" },
  { label: "Picking Queue", route: "/picking" },
  { label: "Dispatch Queue", route: "/dispatch" },
  { label: "Stock Count", route: "/inventory/count" },
  { label: "Inventory Lookup", route: "/inventory/lookup" },
  { label: "Purchase Orders", route: "/receiving" },
  { label: "Sync Dashboard", route: "/sync" },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-bold uppercase tracking-widest text-vyron-subtle">{title}</Text>
      {children}
    </View>
  );
}

function ActivityFeed({
  events,
  onPress,
}: {
  events: OperationalActivityEvent[];
  onPress: (route?: string) => void;
}) {
  if (!events.length) {
    return <VyronCard><Text className="text-sm font-medium text-vyron-muted">No recent activity yet.</Text></VyronCard>;
  }
  return (
    <View className="gap-3">
      {events.map((event) => (
        <Pressable key={event.id} accessibilityRole="button" onPress={() => onPress(event.route)}>
          <VyronCard className="gap-1">
            <Text className="text-xs font-bold text-vyron-emerald">
              {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text className="text-base font-bold text-vyron-text">{event.entityLabel}</Text>
            <Text className="text-sm font-semibold text-vyron-muted">{event.action}</Text>
            <Text className="text-sm font-medium text-vyron-subtle">{event.location}</Text>
          </VyronCard>
        </Pressable>
      ))}
    </View>
  );
}

function AiAlertsPanel({
  alerts,
  onPress,
}: {
  alerts: OperationalAiAlert[];
  onPress: (route: string) => void;
}) {
  if (!alerts.length) {
    return <VyronCard><Text className="text-sm font-medium text-vyron-muted">No AI operational alerts.</Text></VyronCard>;
  }
  return (
    <View className="gap-3">
      {alerts.map((alert) => (
        <Pressable key={alert.id} accessibilityRole="button" onPress={() => onPress(alert.route)}>
          <VyronCard className="gap-2">
            <Text className="text-xs font-bold uppercase tracking-widest text-vyron-rose">{alert.priority}</Text>
            <Text className="text-base font-bold text-vyron-text">{alert.title}</Text>
            <Text className="text-sm font-medium text-vyron-muted">{alert.problem}</Text>
            <Text className="text-sm font-semibold text-vyron-emerald">{alert.recommendation}</Text>
          </VyronCard>
        </Pressable>
      ))}
    </View>
  );
}

function TasksPanel({
  tasks,
  onPress,
}: {
  tasks: SupervisorAggregatedTask[];
  onPress: (route: string) => void;
}) {
  if (!tasks.length) {
    return <VyronCard><Text className="text-sm font-medium text-vyron-muted">No outstanding tasks.</Text></VyronCard>;
  }
  return (
    <View className="gap-3">
      {tasks.slice(0, 12).map((task) => (
        <Pressable key={task.id} accessibilityRole="button" onPress={() => onPress(task.route)}>
          <VyronCard className="gap-2">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">{task.module}</Text>
                <Text className="text-base font-bold text-vyron-text">{task.title}</Text>
                <Text className="text-sm font-medium text-vyron-muted">
                  Owner {task.owner} · {task.status}
                  {task.due ? ` · Due ${task.due}` : ""}
                </Text>
              </View>
              <PriorityBadge priority={task.priority} />
            </View>
          </VyronCard>
        </Pressable>
      ))}
    </View>
  );
}
