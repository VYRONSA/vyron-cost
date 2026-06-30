export type WorkflowStepStatus = "pending" | "active" | "completed" | "blocked";

export type WorkflowDefinition = {
  id: string;
  label: string;
  steps: string[];
};

export const STORE_ORDER_WORKFLOW: WorkflowDefinition = {
  id: "store_order",
  label: "Store Order",
  steps: ["Draft", "Submitted", "Approved", "Picking", "Dispatched", "Delivered"],
};

export function getWorkflowDefinition(workflowId: string): WorkflowDefinition | null {
  if (workflowId === "store_order") return STORE_ORDER_WORKFLOW;
  return null;
}
