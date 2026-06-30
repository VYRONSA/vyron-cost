import type { ProductionOpsTask, ProductionOpsTaskType, ProductionRun } from "@/types/production";
import type { OpsTaskPriority } from "@/types/receiving";

function derivePriority(run: ProductionRun): OpsTaskPriority {
  if (run.status === "In Production") return "high";
  if (run.planned_cost >= 50000) return "high";
  if (run.status === "Approved") return "normal";
  return "normal";
}

function taskTypeForRun(run: ProductionRun): ProductionOpsTaskType {
  if (run.status === "Approved") return "start_production_run";
  if (run.status === "In Production") {
    const remaining = Math.max(run.planned_qty - run.actual_qty, 0);
    if (remaining <= 0) return "complete_production_run";
    return "resume_production_run";
  }
  return "start_production_run";
}

function taskTitle(type: ProductionOpsTaskType) {
  switch (type) {
    case "start_production_run":
      return "Start Production Run";
    case "resume_production_run":
      return "Resume Production Run";
    case "complete_production_run":
      return "Complete Production Run";
    case "record_wastage":
      return "Record Wastage";
  }
}

export function getRunPriority(run: ProductionRun): OpsTaskPriority {
  return derivePriority(run);
}

export function buildProductionOpsTasks(runs: ProductionRun[]): ProductionOpsTask[] {
  return runs
    .filter((run) => ["Approved", "In Production"].includes(run.status))
    .flatMap((run) => {
      const base = {
        productionRunId: run.id,
        runNumber: run.run_number,
        productName: run.product_name_snapshot || run.bom_name_snapshot,
        status: run.status,
        priority: derivePriority(run),
        plannedQty: run.planned_qty,
        producedQty: run.actual_qty,
        productionDate: run.started_at || run.created_at,
      };

      const primaryType = taskTypeForRun(run);
      const tasks: ProductionOpsTask[] = [
        {
          id: `production-${primaryType}-${run.id}`,
          type: primaryType,
          title: taskTitle(primaryType),
          ...base,
        },
      ];

      if (run.status === "In Production") {
        tasks.push({
          id: `production-record_wastage-${run.id}`,
          type: "record_wastage",
          title: taskTitle("record_wastage"),
          ...base,
          priority: "normal",
        });
      }

      return tasks;
    })
    .sort((a, b) => {
      const rank: Record<OpsTaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return rank[a.priority] - rank[b.priority];
    });
}
