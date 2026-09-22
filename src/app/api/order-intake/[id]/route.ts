import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { OrderEngineError } from "@/lib/order-engine/errors";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { issueDefinition } from "@/lib/order-engine/issue-catalog";
import { ACTION_PERMISSION, INTAKE_ACTIONS, availableIntakeActions, isEditable, type IntakeAction } from "@/lib/order-engine/lifecycle";
import { COST_PERMISSION, redactEventMetadata, redactValidation } from "@/lib/order-engine/redaction";
import { editIntake, getIntakeDetail, performIntakeAction, type IntakeDetail, type IntakeEdit } from "@/lib/order-engine/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Shape a detail for the viewer. Cost and margin (and margin messages) are
 * shown only to members who can approve; every issue carries its catalogue
 * title and required action.
 */
function present(detail: IntakeDetail, can: (permission: string) => boolean) {
  const seeCost = can(COST_PERMISSION);
  const validation = redactValidation(detail.intake.validation, seeCost) as IntakeDetail["intake"]["validation"] & {
    issues?: Array<{ code: string }>;
  };
  const issues = (validation as { issues?: Array<{ code: string }> }).issues;
  const withCatalog = issues
    ? {
        ...validation,
        issues: issues.map((issue) => {
          const def = issueDefinition(issue.code);
          return { ...issue, title: def?.title || issue.code, action: def?.action || null, ruleSource: def?.source || null };
        }),
      }
    : validation;
  return {
    ...detail,
    intake: { ...detail.intake, validation: withCatalog },
    events: detail.events.map((event) => ({ ...event, metadata: redactEventMetadata(event.metadata, seeCost) })),
    permissions: {
      canSeeCost: seeCost,
      canEdit: isEditable(detail.intake.status) && can("sales_orders.edit"),
      canRemember: can("sales_orders.approve"),
      actions: availableIntakeActions(detail.intake.status, can),
    },
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const { supabase, companyId, can } = await orderRouteContext("sales_orders.view");
    const detail = await getIntakeDetail(supabase, companyId, id);
    return NextResponse.json({ ok: true, ...present(detail, can) });
  } catch (error) {
    return orderErrorResponse(error, "Load order failed.");
  }
}

/** PATCH: edit the order content while it is Received or an Exception. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.edit");
    const body = await readJsonBody(request);
    const edit: IntakeEdit = {};
    for (const key of ["customerName", "customerPoNumber", "requestedDeliveryDate", "deliveryAddress", "contactName", "notes"] as const) {
      if (key in body) edit[key] = body[key] === null ? null : String(body[key] ?? "");
    }
    if ("customerId" in body) edit.customerId = body.customerId ? String(body.customerId) : null;
    if (body.rememberCustomerReference === true) edit.rememberCustomerReference = true;
    if (body.confirmPricesExTax === true) edit.confirmPricesExTax = true;
    if (Array.isArray(body.resolveLines)) {
      edit.resolveLines = (body.resolveLines as Array<Record<string, unknown>>).map((r) => ({
        lineId: String(r?.lineId ?? ""),
        productId: String(r?.productId ?? ""),
        remember: r?.remember === true,
      }));
    }
    if (Array.isArray(body.updateLines)) {
      edit.updateLines = (body.updateLines as Array<Record<string, unknown>>).map((u) => ({
        lineId: String(u?.lineId ?? ""),
        ...(u && "quantity" in u ? { quantity: Number(u.quantity) } : {}),
        ...(u && "unitPrice" in u ? { unitPrice: u.unitPrice === null || u.unitPrice === "" ? null : Number(u.unitPrice) } : {}),
      }));
    }
    if (typeof body.expectedVersion === "number") edit.expectedVersion = body.expectedVersion;
    // Recording a standing mapping changes how future orders match: approvers only.
    const detail = await editIntake(supabase, companyId, id, edit, actor, { canRemember: can("sales_orders.approve") });
    return NextResponse.json({ ok: true, ...present(detail, can) });
  } catch (error) {
    return orderErrorResponse(error, "Edit order failed.");
  }
}

/** POST: a lifecycle action — { action, reason?, acknowledgeWarnings?, validationHash? }. */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    // Authenticate first, so an anonymous caller learns nothing about actions;
    // then the action's own permission, from the same verified session.
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    const body = await readJsonBody(request);
    const action = String(body.action || "") as IntakeAction;
    if (!INTAKE_ACTIONS.includes(action)) throw new OrderEngineError("INVALID_INPUT", "Unknown action.");
    if (!can(ACTION_PERMISSION[action])) throw new WorkspaceAccessError("Access denied.", 403);
    const detail = await performIntakeAction(supabase, companyId, id, action, actor, {
      reason: typeof body.reason === "string" ? body.reason : null,
      acknowledgeWarnings: body.acknowledgeWarnings === true,
      validationHash: typeof body.validationHash === "string" ? body.validationHash : null,
    });
    return NextResponse.json({ ok: true, ...present(detail, can) });
  } catch (error) {
    return orderErrorResponse(error, "Order action failed.");
  }
}
