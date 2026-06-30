import type { StaffTeamRow } from "@/types/supervisor";

type StaffSignals = {
  openPurchaseOrders: number;
  inProgressRuns: number;
  pickingQueue: number;
  dispatchQueue: number;
  inventoryAlerts: number;
};

function teamStatus(count: number): StaffTeamRow["status"] {
  if (count >= 5) return "Busy";
  if (count > 0) return "Available";
  return "Offline";
}

export function buildStaffStatusRows(signals: StaffSignals): StaffTeamRow[] {
  return [
    {
      id: "receiving",
      team: "Receiving Team",
      status: teamStatus(signals.openPurchaseOrders),
      detail: `${signals.openPurchaseOrders} open POs`,
    },
    {
      id: "production",
      team: "Production Team",
      status: teamStatus(signals.inProgressRuns),
      detail: `${signals.inProgressRuns} runs in progress`,
    },
    {
      id: "warehouse",
      team: "Warehouse Team",
      status: teamStatus(signals.pickingQueue + signals.inventoryAlerts),
      detail: `${signals.pickingQueue} picking · ${signals.inventoryAlerts} alerts`,
    },
    {
      id: "dispatch",
      team: "Dispatch Team",
      status: teamStatus(signals.dispatchQueue),
      detail: `${signals.dispatchQueue} dispatch tasks`,
    },
  ];
}
