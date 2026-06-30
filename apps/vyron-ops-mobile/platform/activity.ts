import type { InventoryLedgerEntry } from "@/types/inventory";
import type { OperationalActivityEvent } from "@/types/supervisor";
import type { ExecutionActionRow } from "@/services/supervisor/supervisor-api";
import { listAuditEvents } from "@/services/audit/audit-service";

function ledgerModule(type: string): OperationalActivityEvent["module"] {
  if (type === "Receipt") return "receiving";
  if (type === "Transfer" || type === "Adjustment" || type === "Count") return "inventory";
  if (type === "Consumption" || type === "Issue") return "production";
  return "system";
}

function ledgerRoute(type: string): string {
  if (type === "Receipt") return "/receiving";
  if (type === "Count") return "/inventory/count";
  if (type === "Transfer") return "/inventory/transfer";
  if (type === "Adjustment") return "/inventory/adjustment";
  return "/inventory/history";
}

export function buildActivityFromLedger(entries: InventoryLedgerEntry[]): OperationalActivityEvent[] {
  return entries.slice(0, 20).map((entry) => ({
    id: `ledger-${entry.id}`,
    timestamp: entry.created_at,
    entityLabel: entry.item_name || entry.item_code,
    action: entry.transaction_type,
    location: entry.reference_label || "Warehouse",
    module: ledgerModule(entry.transaction_type),
    route: ledgerRoute(entry.transaction_type),
  }));
}

export function buildActivityFromExecutionActions(actions: ExecutionActionRow[]): OperationalActivityEvent[] {
  const events: OperationalActivityEvent[] = [];
  for (const action of actions) {
    for (const event of action.action_events ?? []) {
      events.push({
        id: `exec-${action.id}-${event.id}`,
        timestamp: event.at,
        entityLabel: action.title,
        action: event.label,
        location: action.category,
        module: "system",
        route: action.href?.includes("store") ? "/dispatch" : undefined,
      });
    }
  }
  return events;
}

export function buildActivityFromAuditLog(): OperationalActivityEvent[] {
  return listAuditEvents()
    .slice(0, 20)
    .map((event) => ({
      id: `audit-${event.id}`,
      timestamp: event.createdAt,
      entityLabel: event.entityLabel || event.entityType || "Event",
      action: event.action.replace(/_/g, " "),
      location: event.module,
      module:
        event.module === "receiving"
          ? "receiving"
          : event.module === "production"
            ? "production"
            : event.module === "picking" || event.module === "dispatch"
              ? "dispatch"
              : event.module === "inventory"
                ? "inventory"
                : "system",
      route:
        event.module === "receiving"
          ? "/receiving"
          : event.module === "production"
            ? "/production"
            : event.module === "picking"
              ? "/picking"
              : event.module === "dispatch"
                ? "/dispatch"
                : event.module === "inventory"
                  ? "/inventory"
                  : undefined,
    }));
}

export function mergeOperationalActivity(input: {
  ledgerEntries: InventoryLedgerEntry[];
  executionActions: ExecutionActionRow[];
}): OperationalActivityEvent[] {
  const merged = [
    ...buildActivityFromExecutionActions(input.executionActions),
    ...buildActivityFromLedger(input.ledgerEntries),
    ...buildActivityFromAuditLog(),
  ];
  return merged
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 30);
}
