import type { OpsTaskPriority } from "./receiving";

export type ShiftName = "Morning Shift" | "Afternoon Shift" | "Night Shift";

export type OperationalActivityEvent = {
  id: string;
  timestamp: string;
  entityLabel: string;
  action: string;
  location: string;
  module: "receiving" | "production" | "picking" | "dispatch" | "inventory" | "system";
  route?: string;
};

export type OperationalAiAlert = {
  id: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  problem: string;
  recommendation: string;
  title: string;
  route: string;
};

export type SupervisorAggregatedTask = {
  id: string;
  module: "receiving" | "production" | "picking" | "dispatch" | "inventory";
  title: string;
  owner: string;
  due: string | null;
  status: string;
  priority: OpsTaskPriority;
  route: string;
};

export type ShiftMetrics = {
  production: number;
  receiving: number;
  dispatch: number;
  picking: number;
  counts: number;
};

export type ShiftDashboardRow = {
  shift: ShiftName;
  metrics: ShiftMetrics;
  isCurrent: boolean;
};

export type StaffTeamStatus = "Busy" | "Available" | "Offline";

export type StaffTeamRow = {
  id: string;
  team: string;
  status: StaffTeamStatus;
  detail: string;
};

export type EquipmentStatus = "Online" | "Warning" | "Offline" | "Unknown";

export type EquipmentCard = {
  id: string;
  name: string;
  status: EquipmentStatus;
  detail: string;
};

export type NotificationItem = {
  id: string;
  category: "alert" | "warning" | "message" | "ai";
  title: string;
  body: string;
  priority: OpsTaskPriority;
  route?: string;
  unread: boolean;
};

export type SupervisorKpi = {
  id: string;
  title: string;
  subtitle: string;
  value: string | number;
  accent: "emerald" | "violet" | "amber" | "rose" | "sky";
  route: string;
  loading?: boolean;
};
