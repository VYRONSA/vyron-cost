import type { ShiftName } from "@/types/supervisor";

export function getCurrentShift(date = new Date()): ShiftName {
  const hour = date.getHours();
  if (hour >= 6 && hour < 14) return "Morning Shift";
  if (hour >= 14 && hour < 22) return "Afternoon Shift";
  return "Night Shift";
}

export function formatSupervisorClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatSupervisorDate(date = new Date()) {
  return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}
