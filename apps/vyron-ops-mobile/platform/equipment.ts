import type { EquipmentCard } from "@/types/supervisor";

/** Architecture-only equipment registry — future IoT integration plugs in here. */
export const EQUIPMENT_REGISTRY: EquipmentCard[] = [
  { id: "line-1", name: "Production Line 1", status: "Unknown", detail: "Awaiting equipment integration" },
  { id: "line-2", name: "Production Line 2", status: "Unknown", detail: "Awaiting equipment integration" },
  { id: "cold-room", name: "Cold Room", status: "Unknown", detail: "Temperature monitoring not connected" },
  { id: "freezer", name: "Freezer", status: "Unknown", detail: "Temperature monitoring not connected" },
  { id: "generator", name: "Generator", status: "Unknown", detail: "Power monitoring not connected" },
  { id: "power", name: "Power", status: "Unknown", detail: "Grid monitoring not connected" },
];

export function listEquipmentCards(): EquipmentCard[] {
  return EQUIPMENT_REGISTRY;
}
