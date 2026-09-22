import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { OrderEngineError } from "@/lib/order-engine/errors";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import {
  ACTION_PERMISSION,
  INTAKE_ACTIONS,
  availableIntakeActions,
  isEditable,
  type IntakeAction,
} from "@/lib/order-engine/lifecycle";
import { editIntake, getIntakeDetail, performIntakeAction, type IntakeDetail, type IntakeEdit } from "@/lib/order-engine/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Cost and margin are commercial data: shown only to people who can approve (as the Order Centre does). */
function present(detail: IntakeDetail, can: (permission: string) => boolean) {
  const seeCost = can("sales_orders.approve");
  const validation = detail.intake.validation as Record<string, unknown> & {
    lines?: Array<Record<string, unknown>>;
    totals?: Record<string, unknown>;
  };
  const safeValidation =
    seeCost || !validation?.lines
      ? validation
      : {
          ...validation,
          lines: validation.lines.map((line) => ({ ...line, unitCost: null, lineCost: null, lineGp: null })),
          totals: { ...validation.totals, expectedCost: null, expectedGp: null, expectedGpPct: null },
        };
  return {
    ...detail,
    intake: { ...detail.intake, validation: safeValidation },
    permissions: {
      canSeeCost: seeCost,
      canEdit: isEditable(detail.intake.status) && can("sales_orders.edit"),
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
    const text = (key: keyof IntakeEdit) => {
      if (key in body) (edit as Record<string, unknown>)[key] = body[key] === null ? null : String(body[key] ?? "");
    };
    for (const key of ["customerName", "customerPoNumber", "requestedDeliveryDate", "deliveryAddress", "contactName", "notes"] as const) text(key);
    if ("customerId" in body) edit.customerId = body.customerId ? String(body.customerId) : null;
    if (Array.isArray(body.resolveLines)) {
      edit.resolveLines = (body.resolveLines as Array<Record<string, unknown>>).map((r) => ({
        lineId: String(r?.lineId ?? ""),
        productId: String(r?.productId ?? ""),
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
    const detail = await editIntake(supabase, companyId, id, edit, actor);
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
