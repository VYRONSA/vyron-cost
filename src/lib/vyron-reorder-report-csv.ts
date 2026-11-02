import type { ReorderRow } from "@/lib/vyron-reorder-report";

/** The reorder report as CSV — the same columns as the screen, supplier included. */
export function reorderReportCsv(rows: ReorderRow[]): string {
  const header = ["Item code", "Description", "Unit", "Supplier", "On hand", "On order", "Minimum", "Warning", "Needs ordering", "Reorder qty", "Reason"];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [r.itemCode, r.description, r.unit, r.supplier ?? "", r.onHand, r.onOrder, r.minimum, r.warning ?? "", r.needsOrdering ? "Yes" : "No", r.reorderQty, r.reason].map(cell).join(",")
  );
  return [header.map(cell).join(","), ...body].join("\n");
}
