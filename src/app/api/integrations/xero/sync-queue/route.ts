import { NextRequest, NextResponse } from "next/server";
import { listXeroSyncQueueRows, mapQueueRowToDisplay } from "@/lib/vyron-xero-integration";
import { appendXeroAuditEvent } from "@/lib/vyron-xero-connection-store";
import { requireXeroWorkspaceContext, xeroContextFromRequest } from "@/lib/vyron-xero-api-context";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  cancelPendingXeroSyncItems,
  processXeroSyncQueueItem,
  queueAllCustomerInvoicesForXeroSync,
  queueAllCustomersForXeroSync,
  queueAllSuppliersForXeroSync,
  queueCustomerForXeroSync,
  queueCustomerInvoiceForXeroSync,
  queueSupplierForXeroSync,
  retryFailedXeroSyncItems,
  syncAllCustomerInvoicesNow,
  syncAllCustomersNow,
  syncAllSuppliersNow,
  type XeroSyncNowSummary,
} from "@/lib/vyron-xero-sync-engine";
import { isXeroOAuthConfigured } from "@/lib/vyron-xero-integration";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

function oauthNotConfiguredResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Xero OAuth is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI.",
    },
    { status: 400 }
  );
}

async function handleSyncNowAction(
  request: NextRequest,
  body: Record<string, unknown>,
  action: "sync-all-customers-now" | "sync-all-suppliers-now" | "sync-all-invoices-now",
  run: (
    supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
    workspaceId: string,
    companyId: string,
    actor: string
  ) => Promise<XeroSyncNowSummary>,
  auditLabel: string
) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  if (!isXeroOAuthConfigured()) return oauthNotConfiguredResponse();

  const actor = String(body.actor || "user");

  try {
    await requireWorkspacePermission("xero.sync");
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request, body));
    const result = await run(supabase, workspaceId, companyId, actor);

    await appendXeroAuditEvent(
      workspaceId,
      {
        event: result.failed > 0 ? "sync_failed" : "sync_completed",
        actor,
        companyId,
        detail: `${auditLabel}: ${result.queued} queued, ${result.processed} processed, ${result.succeeded} succeeded, ${result.failed} failed.`,
        metadata: {
          action,
          queued: result.queued,
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
        },
      },
      companyId
    );

    return NextResponse.json({ ok: true, action, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Sync now action failed.");
  }
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("xero.view");
    const { companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request));
    const queue = await listXeroSyncQueueRows(supabase, companyId);
    const items = queue.map((row) => mapQueueRowToDisplay(row as Record<string, unknown>));
    return NextResponse.json({ ok: true, items, simulateOnly: !isXeroOAuthConfigured() });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Queue failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = String(body.action || "");
  const actor = String(body.actor || "user");

  if (action === "sync-all-customers-now") {
    return handleSyncNowAction(request, body, action, syncAllCustomersNow, "Customer sync");
  }

  if (action === "sync-all-suppliers-now") {
    return handleSyncNowAction(request, body, action, syncAllSuppliersNow, "Supplier sync");
  }

  if (action === "sync-all-invoices-now") {
    return handleSyncNowAction(request, body, action, syncAllCustomerInvoicesNow, "Invoice sync");
  }

  try {
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request, body));

    if (action === "queue-customer") {
      await requireWorkspacePermission("xero.sync");
      const customerId = String(body.customerId || "");
      if (!customerId) return NextResponse.json({ ok: false, error: "customerId is required." }, { status: 400 });
      const row = await queueCustomerForXeroSync(supabase, companyId, customerId);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_queued", actor, companyId, detail: `Queued customer for Xero sync.`, metadata: { queueItemId: row.id } },
        companyId
      );
      return NextResponse.json({ ok: true, item: mapQueueRowToDisplay(row as Record<string, unknown>) });
    }

    if (action === "queue-supplier") {
      await requireWorkspacePermission("xero.sync");
      const supplierId = String(body.supplierId || "");
      if (!supplierId) return NextResponse.json({ ok: false, error: "supplierId is required." }, { status: 400 });
      const row = await queueSupplierForXeroSync(supabase, companyId, supplierId);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_queued", actor, companyId, detail: `Queued supplier for Xero sync.`, metadata: { queueItemId: row.id } },
        companyId
      );
      return NextResponse.json({ ok: true, item: mapQueueRowToDisplay(row as Record<string, unknown>) });
    }

    if (action === "queue-invoice") {
      await requireWorkspacePermission("xero.sync");
      const invoiceId = String(body.invoiceId || "");
      if (!invoiceId) return NextResponse.json({ ok: false, error: "invoiceId is required." }, { status: 400 });
      const row = await queueCustomerInvoiceForXeroSync(supabase, companyId, invoiceId);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_queued", actor, companyId, detail: `Queued customer invoice for Xero sync.`, metadata: { queueItemId: row.id } },
        companyId
      );
      return NextResponse.json({ ok: true, item: mapQueueRowToDisplay(row as Record<string, unknown>) });
    }

    if (action === "queue-all-customers") {
      await requireWorkspacePermission("xero.sync");
      const result = await queueAllCustomersForXeroSync(supabase, companyId);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_queued", actor, companyId, detail: `Queued ${result.queued} customer(s) for Xero sync.` },
        companyId
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "queue-all-suppliers") {
      await requireWorkspacePermission("xero.sync");
      const result = await queueAllSuppliersForXeroSync(supabase, companyId);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_queued", actor, companyId, detail: `Queued ${result.queued} supplier(s) for Xero sync.` },
        companyId
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "queue-all-invoices") {
      await requireWorkspacePermission("xero.sync");
      const result = await queueAllCustomerInvoicesForXeroSync(supabase, companyId, workspaceId);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_queued", actor, companyId, detail: `Queued ${result.queued} customer invoice(s) for Xero sync.` },
        companyId
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "retry-failed") {
      await requireWorkspacePermission("xero.sync");
      if (!isXeroOAuthConfigured()) return oauthNotConfiguredResponse();
      const result = await retryFailedXeroSyncItems(supabase, workspaceId, companyId, actor);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "cancel-pending") {
      await requireWorkspacePermission("xero.sync");
      const result = await cancelPendingXeroSyncItems(supabase, companyId);
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_failed", actor, companyId, detail: `Cancelled ${result.cancelled} pending queue item(s).` },
        companyId
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: "Queue item id is required." }, { status: 400 });
    }

    const { data: existing, error: loadError } = await supabase
      .from("vyron_xero_sync_queue")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (loadError) return NextResponse.json({ ok: false, error: loadError.message }, { status: 500 });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Queue item not found." }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "cancel") {
      await requireWorkspacePermission("xero.sync");
      const { data, error } = await supabase
        .from("vyron_xero_sync_queue")
        .update({
          status: "Failed",
          error_message: "Cancelled by user.",
          updated_at: now,
        })
        .eq("id", id)
        .eq("company_id", companyId)
        .select("*")
        .maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, item: mapQueueRowToDisplay(data as Record<string, unknown>) });
    }

    if (action === "sync" || action === "retry") {
      await requireWorkspacePermission("xero.sync");
      if (!isXeroOAuthConfigured()) return oauthNotConfiguredResponse();

      if (action === "retry") {
        await appendXeroAuditEvent(
          workspaceId,
          {
            event: "sync_retried",
            actor,
            companyId,
            detail: `Retry requested for ${existing.reference_number}.`,
            metadata: { queueItemId: id },
          },
          companyId
        );
      }

      try {
        const data = await processXeroSyncQueueItem(
          supabase,
          workspaceId,
          companyId,
          existing as Record<string, unknown>,
          actor
        );
        return NextResponse.json({ ok: true, item: mapQueueRowToDisplay(data as Record<string, unknown>) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed.";
        const { data: failedRow } = await supabase
          .from("vyron_xero_sync_queue")
          .select("*")
          .eq("id", id)
          .eq("company_id", companyId)
          .maybeSingle();
        return NextResponse.json(
          {
            ok: false,
            error: message,
            item: failedRow ? mapQueueRowToDisplay(failedRow as Record<string, unknown>) : undefined,
          },
          { status: 400 }
        );
      }
    }

    if (action === "fail") {
      const message = String(body.error || body.reason || "Sync failed.").trim();
      const { data, error } = await supabase
        .from("vyron_xero_sync_queue")
        .update({
          status: "Failed",
          error_message: message,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq("id", id)
        .eq("company_id", companyId)
        .select("*")
        .maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await appendXeroAuditEvent(
        workspaceId,
        { event: "sync_failed", actor, companyId, detail: message, metadata: { queueItemId: id } },
        companyId
      );
      return NextResponse.json({ ok: true, item: mapQueueRowToDisplay(data as Record<string, unknown>) });
    }

    return NextResponse.json({ ok: false, error: "Invalid sync request." }, { status: 400 });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Sync queue action failed.");
  }
}
