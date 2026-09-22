import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { deleteMailbox, listMailboxes, saveMailbox } from "@/lib/order-engine/mailboxes";

export const runtime = "nodejs";

/**
 * Receiving mailboxes. A mailbox decides which tenant an inbound message
 * belongs to, so creating one is an administrative act: approvers only. No
 * credentials are stored here — a provider connector authenticates itself.
 */

export async function GET() {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    return NextResponse.json({ ok: true, mailboxes: await listMailboxes(supabase, companyId) });
  } catch (error) {
    return orderErrorResponse(error, "Load mailboxes failed.");
  }
}

/** PUT /api/order-intake/mailboxes { id?, receivingAddress, status, allowedSenderDomains, … } */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const body = await readJsonBody(request);
    const mailboxes = await saveMailbox(
      supabase,
      companyId,
      {
        id: body.id ? String(body.id) : null,
        receivingAddress: String(body.receivingAddress || ""),
        label: typeof body.label === "string" ? body.label : null,
        provider: typeof body.provider === "string" ? body.provider : null,
        status: typeof body.status === "string" ? body.status : undefined,
        allowedSenderDomains: Array.isArray(body.allowedSenderDomains) ? (body.allowedSenderDomains as string[]) : null,
        allowedSenders: Array.isArray(body.allowedSenders) ? (body.allowedSenders as string[]) : null,
        maxAttachmentBytes: body.maxAttachmentBytes as number | string | null,
        allowedMimeTypes: Array.isArray(body.allowedMimeTypes) ? (body.allowedMimeTypes as string[]) : null,
        requireVerifiedSender: body.requireVerifiedSender === true,
      },
      actor
    );
    return NextResponse.json({ ok: true, mailboxes });
  } catch (error) {
    return orderErrorResponse(error, "Save mailbox failed.");
  }
}

/** DELETE /api/order-intake/mailboxes?id=… */
export async function DELETE(request: NextRequest) {
  try {
    const { supabase, companyId, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const id = String(request.nextUrl.searchParams.get("id") || "");
    if (!id) throw new WorkspaceAccessError("A mailbox id is required.", 400);
    return NextResponse.json({ ok: true, mailboxes: await deleteMailbox(supabase, companyId, id) });
  } catch (error) {
    return orderErrorResponse(error, "Delete mailbox failed.");
  }
}
