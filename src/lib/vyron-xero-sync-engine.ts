import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerInvoice } from "@/lib/vyron-customer-invoices";
import { appendXeroAuditEvent, writeStoredConnection, readStoredConnection } from "@/lib/vyron-xero-connection-store";
import { xeroApiRequest, XeroApiError, type XeroContactResponse, type XeroInvoiceResponse } from "@/lib/vyron-xero-client";
import {
  evaluateMappingReadiness,
  getContactMapping,
  loadCustomerForSync,
  loadSupplierForSync,
  readXeroWorkspaceSettings,
  upsertContactMapping,
} from "@/lib/vyron-xero-mapping";
import type { XeroQueueEntityType } from "@/lib/vyron-xero-integration";

function attemptCount(row: Record<string, unknown>) {
  const payload = (row.payload || {}) as Record<string, unknown>;
  return Number(payload.attemptCount || 0);
}

function isoDate(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

async function syncXeroContact(
  workspaceId: string,
  companyId: string,
  input: {
    localType: "customer" | "supplier";
    localId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  },
  actor: string
) {
  const settings = await readXeroWorkspaceSettings(workspaceId);
  const existing = getContactMapping(settings, input.localType, input.localId);
  if (existing?.xeroContactId) {
    return existing;
  }

  const body = {
    Contacts: [
      {
        Name: input.name,
        EmailAddress: input.email || undefined,
        Phones: input.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: input.phone }] : undefined,
        IsCustomer: input.localType === "customer",
        IsSupplier: input.localType === "supplier",
      },
    ],
  };

  const response = await xeroApiRequest<XeroContactResponse>(workspaceId, "/Contacts", {
    method: "POST",
    body,
    companyId,
    actor,
  });

  const contact = response.Contacts?.[0];
  if (!contact?.ContactID) {
    throw new XeroApiError("Xero did not return a contact ID.", 500);
  }

  const mapping = {
    localType: input.localType,
    localId: input.localId,
    xeroContactId: contact.ContactID,
    xeroContactName: contact.Name || input.name,
    lastSyncedAt: new Date().toISOString(),
    syncStatus: "synced" as const,
    lastError: null,
  };

  await upsertContactMapping(workspaceId, mapping);
  return mapping;
}

async function syncCustomerRecord(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  entityId: string,
  actor: string
) {
  const customer = await loadCustomerForSync(supabase, companyId, entityId);
  if (!customer) throw new Error("Customer not found for active company.");

  const mapping = await syncXeroContact(workspaceId, companyId, {
    localType: "customer",
    localId: entityId,
    name: String(customer.customer_name),
    email: customer.invoice_email || customer.email,
    phone: customer.phone,
  }, actor);

  return { xeroId: mapping.xeroContactId, reference: String(customer.customer_name) };
}

async function syncSupplierRecord(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  entityId: string,
  actor: string
) {
  const supplier = await loadSupplierForSync(supabase, companyId, entityId);
  if (!supplier) throw new Error("Supplier not found for active company.");

  const mapping = await syncXeroContact(workspaceId, companyId, {
    localType: "supplier",
    localId: entityId,
    name: String(supplier.supplier_name),
    email: supplier.email,
    phone: supplier.phone,
  }, actor);

  return { xeroId: mapping.xeroContactId, reference: String(supplier.supplier_name) };
}

async function syncCustomerInvoiceRecord(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  entityId: string,
  actor: string
) {
  const settings = await readXeroWorkspaceSettings(workspaceId);
  const readiness = evaluateMappingReadiness(settings, "Customer Invoice");
  if (!readiness.ready) {
    throw new Error(`Missing required mappings: ${readiness.missing.join(", ")}`);
  }

  if (!settings.syncConfig.outboundCustomerInvoices) {
    throw new Error("Customer invoice sync is disabled in sync configuration.");
  }

  const loaded = await getCustomerInvoice(supabase, entityId, companyId);
  if (!loaded) throw new Error("Customer invoice not found for active company.");
  const { invoice, lines } = loaded;

  let contactMapping = invoice.customer_id
    ? getContactMapping(settings, "customer", invoice.customer_id)
    : null;

  if (!contactMapping && invoice.customer_id) {
    contactMapping = await syncXeroContact(workspaceId, companyId, {
      localType: "customer",
      localId: invoice.customer_id,
      name: invoice.customer_name,
    }, actor);
  }

  if (!contactMapping?.xeroContactId) {
    throw new Error("Customer contact mapping is required before invoice sync.");
  }

  const invoiceBody = {
    Invoices: [
      {
        Type: "ACCREC",
        Contact: { ContactID: contactMapping.xeroContactId },
        Date: isoDate(invoice.invoice_date),
        DueDate: isoDate(invoice.due_date || invoice.invoice_date),
        InvoiceNumber: invoice.invoice_number,
        LineItems: lines.map((line) => ({
          Description: line.product_name,
          Quantity: Number(line.quantity || 0),
          UnitAmount: Number(line.selling_price || 0),
          AccountCode: settings.accounts.salesAccount,
          TaxType: settings.accounts.vatStandard,
        })),
        Status: settings.syncConfig.invoiceStatus || "DRAFT",
      },
    ],
  };

  const response = await xeroApiRequest<XeroInvoiceResponse>(workspaceId, "/Invoices", {
    method: "POST",
    body: invoiceBody,
    companyId,
    actor,
  });

  const created = response.Invoices?.[0];
  if (!created?.InvoiceID) {
    throw new XeroApiError("Xero did not return an invoice ID.", 500);
  }

  return {
    xeroId: created.InvoiceID,
    reference: created.InvoiceNumber || invoice.invoice_number,
    xeroLink: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${created.InvoiceID}`,
  };
}

async function syncSupplierBillRecord(
  _supabase: SupabaseClient,
  workspaceId: string,
  _companyId: string,
  row: Record<string, unknown>,
  _actor: string
): Promise<{ xeroId: string; reference: string; xeroLink?: string }> {
  const settings = await readXeroWorkspaceSettings(workspaceId);
  if (!settings.syncConfig.outboundSupplierBills) {
    throw new Error("Supplier bill sync is not enabled. Enable in sync configuration when ready.");
  }

  const readiness = evaluateMappingReadiness(settings, "Supplier Bill");
  if (!readiness.ready) {
    throw new Error(`Missing required mappings: ${readiness.missing.join(", ")}`);
  }

  const payload = (row.payload || {}) as Record<string, unknown>;
  const supplierName = String(payload.supplierName || "").trim();
  const total = Number(payload.total || 0);
  if (!supplierName || total <= 0) {
    throw new Error(
      "Bills sync not ready: supplier invoice document must include supplier name and total amount."
    );
  }

  throw new Error(
    "Supplier bill sync requires linked supplier master record and line-level bill data. Queue document for review and link supplier first."
  );
}

export async function processXeroSyncQueueItem(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  row: Record<string, unknown>,
  actor = "user"
) {
  const entityType = String(row.entity_type || "") as XeroQueueEntityType;
  const entityId = row.entity_id ? String(row.entity_id) : null;
  const id = String(row.id);
  const now = new Date().toISOString();
  const nextAttempt = attemptCount(row) + 1;

  await appendXeroAuditEvent(
    workspaceId,
    {
      event: "sync_started",
      actor,
      companyId,
      detail: `Processing ${row.reference_number} (${entityType}).`,
      metadata: { queueItemId: id, entityType },
    },
    companyId
  );

  await supabase
    .from("vyron_xero_sync_queue")
    .update({
      status: "Ready",
      last_attempt_at: now,
      updated_at: now,
      payload: { ...(row.payload as object), attemptCount: nextAttempt, processingAt: now },
    })
    .eq("id", id)
    .eq("company_id", companyId);

  try {
    let result: { xeroId: string; reference: string; xeroLink?: string };

    if (entityType === "Customer") {
      if (!entityId) throw new Error("Customer queue item missing entity_id.");
      result = await syncCustomerRecord(supabase, workspaceId, companyId, entityId, actor);
    } else if (entityType === "Supplier") {
      if (!entityId) throw new Error("Supplier queue item missing entity_id.");
      result = await syncSupplierRecord(supabase, workspaceId, companyId, entityId, actor);
    } else if (entityType === "Customer Invoice") {
      if (!entityId) throw new Error("Customer invoice queue item missing entity_id.");
      result = await syncCustomerInvoiceRecord(supabase, workspaceId, companyId, entityId, actor);
    } else if (entityType === "Supplier Bill") {
      result = await syncSupplierBillRecord(supabase, workspaceId, companyId, row, actor);
    } else {
      throw new Error(`${entityType} sync is not supported yet.`);
    }

    const syncedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("vyron_xero_sync_queue")
      .update({
        status: "Synced",
        xero_id: result.xeroId,
        synced_at: syncedAt,
        last_attempt_at: syncedAt,
        updated_at: syncedAt,
        error_message: null,
        payload: {
          ...(row.payload as object),
          attemptCount: nextAttempt,
          xeroLink: result.xeroLink || null,
        },
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    const stored = await readStoredConnection(workspaceId);
    if (stored) {
      await writeStoredConnection(workspaceId, { ...stored, lastSyncAt: syncedAt, status: "Connected" });
    }

    await appendXeroAuditEvent(
      workspaceId,
      {
        event: "sync_completed",
        actor,
        companyId,
        detail: `Synced ${result.reference} to Xero.`,
        metadata: { queueItemId: id, xeroId: result.xeroId },
      },
      companyId
    );

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    const failedAt = new Date().toISOString();

    const stored = await readStoredConnection(workspaceId);
    if (stored && error instanceof XeroApiError && error.status === 401) {
      await writeStoredConnection(workspaceId, { ...stored, status: "Token Expired" as typeof stored.status });
    } else if (stored) {
      await writeStoredConnection(workspaceId, { ...stored, status: "Sync Error" as typeof stored.status });
    }

    await supabase
      .from("vyron_xero_sync_queue")
      .update({
        status: "Failed",
        error_message: message,
        last_attempt_at: failedAt,
        updated_at: failedAt,
        payload: { ...(row.payload as object), attemptCount: nextAttempt },
      })
      .eq("id", id)
      .eq("company_id", companyId);

    await appendXeroAuditEvent(
      workspaceId,
      {
        event: "sync_failed",
        actor,
        companyId,
        detail: `Sync failed for ${row.reference_number}: ${message}`,
        metadata: { queueItemId: id, attemptCount: nextAttempt },
      },
      companyId
    );

    throw error;
  }
}

export async function queueCustomerForXeroSync(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string
) {
  const customer = await loadCustomerForSync(supabase, companyId, customerId);
  if (!customer) throw new Error("Customer not found.");

  const { data: existing } = await supabase
    .from("vyron_xero_sync_queue")
    .select("id")
    .eq("company_id", companyId)
    .eq("entity_type", "Customer")
    .eq("entity_id", customerId)
    .neq("status", "Synced")
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .insert({
      company_id: companyId,
      entity_type: "Customer",
      entity_id: customerId,
      reference_number: `CUST-${String(customer.customer_name).slice(0, 40)}`,
      destination: "Xero Contact",
      status: "Ready",
      payload: { customerName: customer.customer_name, attemptCount: 0 },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function queueSupplierForXeroSync(
  supabase: SupabaseClient,
  companyId: string,
  supplierId: string
) {
  const supplier = await loadSupplierForSync(supabase, companyId, supplierId);
  if (!supplier) throw new Error("Supplier not found.");

  const { data: existing } = await supabase
    .from("vyron_xero_sync_queue")
    .select("id")
    .eq("company_id", companyId)
    .eq("entity_type", "Supplier")
    .eq("entity_id", supplierId)
    .neq("status", "Synced")
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .insert({
      company_id: companyId,
      entity_type: "Supplier",
      entity_id: supplierId,
      reference_number: `SUP-${String(supplier.supplier_name).slice(0, 40)}`,
      destination: "Xero Contact",
      status: "Ready",
      payload: { supplierName: supplier.supplier_name, attemptCount: 0 },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function queueCustomerInvoiceForXeroSync(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string
) {
  const loaded = await getCustomerInvoice(supabase, invoiceId, companyId);
  if (!loaded) throw new Error("Customer invoice not found.");
  const { invoice } = loaded;

  if (invoice.status === "Cancelled") {
    throw new Error("Cancelled invoices cannot be queued for Xero sync.");
  }

  const { data: existing } = await supabase
    .from("vyron_xero_sync_queue")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_number", invoice.invoice_number)
    .eq("entity_type", "Customer Invoice")
    .neq("status", "Synced")
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .insert({
      company_id: companyId,
      entity_type: "Customer Invoice",
      entity_id: invoice.id,
      reference_number: invoice.invoice_number,
      destination: "Xero Sales Invoice",
      status: "Ready",
      payload: {
        customerName: invoice.customer_name,
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        salesValue: invoice.sales_value,
        attemptCount: 0,
      },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function queueAllCustomersForXeroSync(supabase: SupabaseClient, companyId: string) {
  const { data: customers, error } = await supabase.from("vyron_customers").select("id").eq("company_id", companyId);
  if (error) throw new Error(error.message);

  let queued = 0;
  for (const customer of customers || []) {
    await queueCustomerForXeroSync(supabase, companyId, String(customer.id));
    queued += 1;
  }
  return { queued, total: (customers || []).length };
}

export async function queueAllSuppliersForXeroSync(supabase: SupabaseClient, companyId: string) {
  const { data: suppliers, error } = await supabase
    .from("vyron_cost_suppliers")
    .select("id")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  let queued = 0;
  for (const supplier of suppliers || []) {
    await queueSupplierForXeroSync(supabase, companyId, String(supplier.id));
    queued += 1;
  }
  return { queued, total: (suppliers || []).length };
}

export async function queueAllCustomerInvoicesForXeroSync(
  supabase: SupabaseClient,
  companyId: string,
  workspaceId: string
) {
  const settings = await readXeroWorkspaceSettings(workspaceId);
  const readiness = evaluateMappingReadiness(settings, "Customer Invoice");
  if (!readiness.ready) {
    throw new Error(
      `Invoice sync blocked until required mappings are set: ${readiness.missing.join(", ")}`
    );
  }

  const { data: invoices, error } = await supabase
    .from("vyron_customer_invoices")
    .select("id, status")
    .eq("company_id", companyId)
    .neq("status", "Cancelled");
  if (error) throw new Error(error.message);

  let queued = 0;
  for (const invoice of invoices || []) {
    await queueCustomerInvoiceForXeroSync(supabase, companyId, String(invoice.id));
    queued += 1;
  }
  return { queued, total: (invoices || []).length };
}

export async function retryFailedXeroSyncItems(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  actor = "user"
) {
  const { data: rows, error } = await supabase
    .from("vyron_xero_sync_queue")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "Failed");
  if (error) throw new Error(error.message);

  let retried = 0;
  let failed = 0;
  for (const row of rows || []) {
    try {
      await processXeroSyncQueueItem(supabase, workspaceId, companyId, row as Record<string, unknown>, actor);
      retried += 1;
    } catch {
      failed += 1;
    }
  }
  return { retried, failed, total: (rows || []).length };
}

export async function cancelPendingXeroSyncItems(supabase: SupabaseClient, companyId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("vyron_xero_sync_queue")
    .update({
      status: "Failed",
      error_message: "Cancelled by user.",
      updated_at: now,
    })
    .eq("company_id", companyId)
    .eq("status", "Ready")
    .select("id");
  if (error) throw new Error(error.message);
  return { cancelled: (data || []).length };
}

export type XeroSyncNowSummary = {
  queued: number;
  processed: number;
  succeeded: number;
  failed: number;
  total: number;
  errors: string[];
};

type XeroSyncEntityType = "Customer" | "Supplier" | "Customer Invoice";

async function processReadyXeroQueueByEntityType(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  entityType: XeroSyncEntityType,
  actor: string
): Promise<Pick<XeroSyncNowSummary, "processed" | "succeeded" | "failed" | "errors">> {
  const { data: rows, error } = await supabase
    .from("vyron_xero_sync_queue")
    .select("*")
    .eq("company_id", companyId)
    .eq("entity_type", entityType)
    .eq("status", "Ready")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    processed += 1;
    const record = row as Record<string, unknown>;
    const reference = String(record.reference_number || record.id || "item");
    try {
      await processXeroSyncQueueItem(supabase, workspaceId, companyId, record, actor);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Sync failed.";
      errors.push(`${reference}: ${message}`);
    }
  }

  return { processed, succeeded, failed, errors };
}

export async function syncAllCustomersNow(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  actor = "user"
): Promise<XeroSyncNowSummary> {
  const queueResult = await queueAllCustomersForXeroSync(supabase, companyId);
  const processResult = await processReadyXeroQueueByEntityType(
    supabase,
    workspaceId,
    companyId,
    "Customer",
    actor
  );
  return { ...queueResult, ...processResult };
}

export async function syncAllSuppliersNow(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  actor = "user"
): Promise<XeroSyncNowSummary> {
  const queueResult = await queueAllSuppliersForXeroSync(supabase, companyId);
  const processResult = await processReadyXeroQueueByEntityType(
    supabase,
    workspaceId,
    companyId,
    "Supplier",
    actor
  );
  return { ...queueResult, ...processResult };
}

export async function syncAllCustomerInvoicesNow(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  actor = "user"
): Promise<XeroSyncNowSummary> {
  const queueResult = await queueAllCustomerInvoicesForXeroSync(supabase, companyId, workspaceId);
  const processResult = await processReadyXeroQueueByEntityType(
    supabase,
    workspaceId,
    companyId,
    "Customer Invoice",
    actor
  );
  return { ...queueResult, ...processResult };
}
