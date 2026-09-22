import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, isMissingRelation, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText } from "@/lib/order-engine/normalize";
import { listMailboxes, type MailboxRow } from "@/lib/order-engine/mailboxes";
import { getPdfExtractor, listPdfExtractors } from "@/lib/order-engine/extractors/pdf";
import { listChannelSettings, loadOrderSettings, type ChannelSettings, type EffectiveOrderSettings } from "@/lib/order-engine/settings";
import type { OrderCandidate, OrderEngineActor, OrderSource } from "@/lib/order-engine/types";

/**
 * Channel activation.
 *
 * Each channel is activated on its own, in stages, per tenant:
 *
 *   DISABLED → CONFIGURED → READY_FOR_UAT → UAT_PASSED
 *            → READY_FOR_ACTIVATION → ACTIVE      (ACTIVE ⇄ SUSPENDED)
 *
 * Holding credentials never activates anything. ACTIVE is a recorded human
 * decision AND every one of the channel's readiness conditions must hold at
 * the moment of activation — and again whenever a connector hands work in.
 * One channel's state says nothing about another's.
 *
 * Credentials are never stored here or anywhere in the repository: a channel
 * names the environment variable its deployment must provide, and this module
 * only reports whether that variable is present.
 */

export const CHANNEL_TYPES = ["manual", "csv", "xlsx", "email", "pdf", "web_store"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const ACTIVATION_STATES = ["DISABLED", "CONFIGURED", "READY_FOR_UAT", "UAT_PASSED", "READY_FOR_ACTIVATION", "ACTIVE", "SUSPENDED"] as const;
export type ActivationState = (typeof ACTIVATION_STATES)[number];

/**
 * In-app channels need no connector, credential or provider: a person keys an
 * order in or uploads a file, inside the workspace, already authenticated.
 * They are live unless a tenant explicitly disables or suspends them. Every
 * channel that reaches outside VOLORA starts DISABLED.
 */
export const IN_APP_CHANNELS: ChannelType[] = ["manual", "csv", "xlsx"];

/** The environment variable a deployment must provide for each external channel. */
export const CHANNEL_CREDENTIAL_ENV: Partial<Record<ChannelType, string>> = {
  email: "VYRON_MAIL_WEBHOOK_SECRET",
  pdf: "VYRON_PDF_EXTRACTOR_KEY",
  web_store: "VYRON_WEB_STORE_CREDENTIALS",
};

export const ALLOWED_TRANSITIONS: Record<ActivationState, ActivationState[]> = {
  DISABLED: ["CONFIGURED"],
  CONFIGURED: ["READY_FOR_UAT", "DISABLED"],
  READY_FOR_UAT: ["UAT_PASSED", "CONFIGURED", "DISABLED"],
  UAT_PASSED: ["READY_FOR_ACTIVATION", "CONFIGURED", "DISABLED"],
  READY_FOR_ACTIVATION: ["ACTIVE", "CONFIGURED", "DISABLED"],
  ACTIVE: ["SUSPENDED", "DISABLED"],
  SUSPENDED: ["ACTIVE", "DISABLED"],
};

/** The channel a source belongs to. */
export function channelTypeForSource(source: OrderSource): ChannelType {
  if (source === "woocommerce" || source === "shopify") return "web_store";
  if (source === "email") return "email";
  if (source === "pdf") return "pdf";
  if (source === "xlsx") return "xlsx";
  if (source === "csv") return "csv";
  return "manual";
}

/** The channel key a candidate belongs to (web stores are per store). */
export function channelKeyForCandidate(candidate: Pick<OrderCandidate, "source" | "catalogSystem">): string {
  const type = channelTypeForSource(candidate.source);
  if (type !== "web_store") return type;
  return cleanText(candidate.catalogSystem, 160) || candidate.source;
}

export type ChannelRequirement = { id: string; label: string; met: boolean; detail: string };

export type ChannelReadiness = {
  channelType: ChannelType;
  channelKey: string;
  label: string | null;
  state: ActivationState;
  /** The state the record says, before defaults are applied. */
  recordedState: ActivationState | null;
  enabled: boolean;
  requirements: ChannelRequirement[];
  /** Every requirement met — activation is possible (a person must still do it). */
  ready: boolean;
  blockedBy: string[];
  nextStates: ActivationState[];
  activity: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    exceptionCount: number;
    activatedAt: string | null;
    activatedBy: string | null;
    uatPassedAt: string | null;
    uatReference: string | null;
    firstLiveAt: string | null;
    firstLiveIntakeId: string | null;
  };
};

const met = (id: string, label: string, ok: boolean, detail: string): ChannelRequirement => ({ id, label, met: ok, detail });

function emailRequirements(mailboxes: MailboxRow[]): ChannelRequirement[] {
  const active = mailboxes.filter((m) => m.status === "ACTIVE");
  const one = active[0] || mailboxes[0] || null;
  const senderPolicy = Boolean(one && ((one.allowed_senders || []).length || (one.allowed_sender_domains || []).length));
  const attachmentPolicy = Boolean(one && ((one.allowed_mime_types || []).length || one.max_attachment_bytes));
  const secret = Boolean(process.env[CHANNEL_CREDENTIAL_ENV.email!]);
  return [
    met("mailbox", "A receiving address is configured for this workspace", Boolean(one), one ? `${one.receiving_address} (${one.status})` : "No mailbox has been added."),
    met("mailbox_active", "The mailbox is active", active.length > 0, active.length ? `${active.length} active mailbox(es).` : "Every mailbox is disabled."),
    met("mailbox_unique", "The address is assigned to exactly one workspace", Boolean(one), "Receiving addresses are globally unique; the database enforces it."),
    met("sender_policy", "A sender / domain policy exists", senderPolicy, senderPolicy ? "Only the listed senders are accepted." : "No policy: every message would be held for a person."),
    met("attachment_policy", "An attachment policy exists", attachmentPolicy, attachmentPolicy ? "Types and size limit set on the mailbox." : "The engine's own limits apply (CSV / Excel / PDF, 10 MB). Set them on the mailbox to make the policy explicit."),
    met("duplicate_protection", "Duplicate protection is on", true, "Message id and attachment hash are both checked."),
    met("audit_trail", "The audit trail is on", true, "Every message, order and decision is recorded."),
    met("exception_handling", "Exception handling is on", true, "Anything not accepted is quarantined in the Exception Centre."),
    met("provider_secret", `The provider secret ${CHANNEL_CREDENTIAL_ENV.email} is present`, secret, secret ? "Supplied by the environment." : "Not set in this environment; the webhook cannot verify the provider."),
  ];
}

function pdfRequirements(settings: EffectiveOrderSettings): ChannelRequirement[] {
  const id = settings.pdfExtractor;
  const extractor = getPdfExtractor(id);
  const credential = Boolean(process.env[CHANNEL_CREDENTIAL_ENV.pdf!]);
  return [
    met("provider_identity", "A document extractor is named in Order rules", Boolean(id), id ? `Configured: ${id}.` : "No extractor chosen."),
    met("provider_available", "That extractor is registered in this deployment", Boolean(extractor), extractor ? `${extractor.label} is available.` : listPdfExtractors().length ? `Available: ${listPdfExtractors().join(", ")}.` : "No provider is registered in this build."),
    met("credential", `The extractor credential ${CHANNEL_CREDENTIAL_ENV.pdf} is present`, credential, credential ? "Supplied by the environment." : "Not set in this environment."),
    met("schema", "Responses are validated against the canonical extraction contract", true, "Every response is checked before it becomes an order (extraction.ts)."),
    met("confidence", "Per-field confidence is required", true, "A response without confidence is refused."),
    met("raw_values", "Raw values are retained beside normalised ones", true, "Kept on the extraction attempt and the order's frozen source snapshot."),
    met("page_references", "Page references are retained where the provider supplies them", true, "Stored per field; never invented."),
    met("low_confidence_blocks", "Low confidence blocks approval", true, "EXTRACTION_LOW_CONFIDENCE is a blocking exception."),
  ];
}

function webStoreRequirements(settings: EffectiveOrderSettings, channel: ChannelSettings | null, links: number): ChannelRequirement[] {
  const credential = Boolean(process.env[CHANNEL_CREDENTIAL_ENV.web_store!]);
  const mappingsReady = settings.skuAlignment === "source_equals_vyron" || links > 0;
  return [
    met("d1_fulfil", "D1 says web-store orders are fulfilled in VOLORA", settings.webOrdersMode === "fulfil", settings.webOrdersMode ? `D1 is "${settings.webOrdersMode}".` : "D1 has not been decided; web orders are held."),
    met("store_identity", "The store is identified (channel key and label)", Boolean(channel?.channel_key && channel?.label), channel?.channel_key ? `${channel.channel_key}${channel.label ? ` — ${channel.label}` : " — no label"}` : "No channel row."),
    met("credential", `Store credentials ${CHANNEL_CREDENTIAL_ENV.web_store} are present`, credential, credential ? "Supplied by the environment." : "Not set in this environment."),
    met("vat", "The store's VAT basis is stated", channel?.prices_include_tax !== null && channel?.prices_include_tax !== undefined, channel?.prices_include_tax === null || channel?.prices_include_tax === undefined ? "Not stated (D3)." : channel.prices_include_tax ? "Prices include VAT." : "Prices exclude VAT."),
    met("status_mapping", "The statuses that mean ready to fulfil are listed", Boolean(channel?.eligible_statuses?.length), channel?.eligible_statuses?.length ? channel.eligible_statuses.join(", ") : "Not listed (D10)."),
    met("shipping", "Shipping treatment is decided", Boolean(settings.shippingTreatment), settings.shippingTreatment || "Not decided (D4)."),
    met("refunds", "Refund treatment is decided", Boolean(settings.refundTreatment), settings.refundTreatment || "Not decided: refunds are recorded and warned, never netted."),
    met("product_mappings", "Product identity is settled", mappingsReady, settings.skuAlignment === "source_equals_vyron" ? "Store SKUs are VOLORA SKUs (D9)." : links > 0 ? `${links} product link(s) recorded.` : "No product links and no SKU decision (D9)."),
    met("customer_mappings", "Customer identity is settled", Boolean(settings.b2cCustomerId), settings.b2cCustomerId ? "A B2C account is chosen (D2); known customers still match on their own identity." : "No B2C account (D2); unknown web customers stop in Exceptions."),
  ];
}

/** Readiness for one channel, from the tenant's live configuration. */
export function channelReadinessFor(input: {
  channelType: ChannelType;
  channelKey: string;
  settings: EffectiveOrderSettings;
  channel: ChannelSettings | null;
  mailboxes: MailboxRow[];
  productLinks: number;
  exceptionCount: number;
}): ChannelReadiness {
  const { channelType, channelKey, settings, channel, mailboxes, productLinks, exceptionCount } = input;
  const requirements =
    channelType === "email"
      ? emailRequirements(mailboxes)
      : channelType === "pdf"
        ? pdfRequirements(settings)
        : channelType === "web_store"
          ? webStoreRequirements(settings, channel, productLinks)
          : [met("in_app", "No connector, provider or credential is needed", true, "A person keys the order in or uploads the file inside the workspace.")];
  const recordedState = (channel?.activation_state as ActivationState | undefined) ?? null;
  const state: ActivationState = recordedState ?? (IN_APP_CHANNELS.includes(channelType) ? "ACTIVE" : "DISABLED");
  const blockedBy = requirements.filter((r) => !r.met).map((r) => r.label);
  return {
    channelType,
    channelKey,
    label: channel?.label ?? null,
    state,
    recordedState,
    enabled: channel?.enabled ?? IN_APP_CHANNELS.includes(channelType),
    requirements,
    ready: blockedBy.length === 0,
    blockedBy,
    nextStates: ALLOWED_TRANSITIONS[state],
    activity: {
      lastSuccessAt: channel?.last_success_at ?? null,
      lastFailureAt: channel?.last_failure_at ?? null,
      lastFailureReason: channel?.last_failure_reason ?? null,
      exceptionCount,
      activatedAt: channel?.activated_at ?? null,
      activatedBy: channel?.activated_by ?? null,
      uatPassedAt: channel?.uat_passed_at ?? null,
      uatReference: channel?.uat_reference ?? null,
      firstLiveAt: channel?.first_live_at ?? null,
      firstLiveIntakeId: channel?.first_live_intake_id ?? null,
    },
  };
}

/** Readiness for every channel a tenant has (plus one row per web store). */
export async function loadChannelReadiness(supabase: SupabaseClient, companyId: string): Promise<ChannelReadiness[]> {
  const [settings, channels, mailboxes] = await Promise.all([
    loadOrderSettings(supabase, companyId),
    listChannelSettings(supabase, companyId),
    listMailboxes(supabase, companyId),
  ]);

  // Open exceptions per source, and quarantined messages for e-mail.
  const exceptionsBySource = new Map<string, number>();
  const { data: intakes, error } = await supabase
    .from("vyron_order_intakes")
    .select("source, status")
    .eq("company_id", companyId)
    .in("status", ["EXCEPTION"]);
  if (error && !isMissingRelation(error)) raiseDbError(error, "Channel exception count failed");
  for (const row of (intakes || []) as Array<{ source: OrderSource }>) {
    const type = channelTypeForSource(row.source);
    exceptionsBySource.set(type, (exceptionsBySource.get(type) || 0) + 1);
  }
  const { data: quarantined, error: messageError } = await supabase
    .from("vyron_order_source_messages")
    .select("id, processing_status")
    .eq("company_id", companyId)
    .in("processing_status", ["QUARANTINED", "NEEDS_EXTRACTION", "FAILED"]);
  if (messageError && !isMissingRelation(messageError)) raiseDbError(messageError, "Channel message count failed");
  for (const row of (quarantined || []) as Array<{ processing_status: string }>) {
    const type: ChannelType = row.processing_status === "NEEDS_EXTRACTION" ? "pdf" : "email";
    exceptionsBySource.set(type, (exceptionsBySource.get(type) || 0) + 1);
  }

  const { data: links } = await supabase
    .from("vyron_import_source_links")
    .select("source_system, entity_type")
    .eq("company_id", companyId)
    .eq("entity_type", "product");
  const linksBySystem = new Map<string, number>();
  for (const row of (links || []) as Array<{ source_system: string }>) {
    linksBySystem.set(String(row.source_system), (linksBySystem.get(String(row.source_system)) || 0) + 1);
  }

  const out: ChannelReadiness[] = [];
  for (const channelType of CHANNEL_TYPES) {
    if (channelType === "web_store") continue;
    const channel = channels.find((c) => (c.channel_type || "web_store") === channelType) || null;
    out.push(
      channelReadinessFor({
        channelType,
        channelKey: channel?.channel_key || channelType,
        settings,
        channel,
        mailboxes,
        productLinks: 0,
        exceptionCount: exceptionsBySource.get(channelType) || 0,
      })
    );
  }
  const stores = channels.filter((c) => (c.channel_type || "web_store") === "web_store");
  const storeRows = stores.length ? stores : [null];
  for (const channel of storeRows) {
    out.push(
      channelReadinessFor({
        channelType: "web_store",
        channelKey: channel?.channel_key || "web_store",
        settings,
        channel,
        mailboxes,
        productLinks: channel ? linksBySystem.get(channel.channel_key) || 0 : 0,
        exceptionCount: exceptionsBySource.get("web_store") || 0,
      })
    );
  }
  return out;
}

/** The channel row for a type / key, creating nothing. */
async function findChannelRow(supabase: SupabaseClient, companyId: string, channelType: ChannelType, channelKey: string): Promise<ChannelSettings | null> {
  const channels = await listChannelSettings(supabase, companyId);
  return (
    channels.find((c) => c.channel_key.toLowerCase() === channelKey.toLowerCase()) ||
    channels.find((c) => (c.channel_type || "web_store") === channelType && channelType !== "web_store") ||
    null
  );
}

export type ActivationChange = {
  channelType: ChannelType;
  channelKey?: string | null;
  to: ActivationState;
  reason?: string | null;
  /** Required to record UAT_PASSED: what proves it (a run id, a document, a date). */
  uatReference?: string | null;
};

/**
 * Move a channel along its activation path. Every step is checked: the
 * transition must be allowed, UAT_PASSED needs its evidence, ACTIVE needs
 * every readiness condition met, and SUSPENDED needs a reason. Activation is
 * recorded with who did it and when.
 */
export async function setChannelActivation(
  supabase: SupabaseClient,
  companyId: string,
  change: ActivationChange,
  actor: OrderEngineActor
): Promise<ChannelReadiness[]> {
  if (!CHANNEL_TYPES.includes(change.channelType)) throw new OrderEngineError("INVALID_INPUT", `Unknown channel "${String(change.channelType)}".`);
  if (!ACTIVATION_STATES.includes(change.to)) throw new OrderEngineError("INVALID_INPUT", `Unknown activation state "${String(change.to)}".`);
  const channelKey = cleanText(change.channelKey, 160) || change.channelType;
  if (change.channelType === "web_store" && channelKey === "web_store") {
    throw new OrderEngineError("INVALID_INPUT", "A web store must be identified by its channel key (for example \"woocommerce:main-store\").");
  }

  const existing = await findChannelRow(supabase, companyId, change.channelType, channelKey);
  const current: ActivationState = (existing?.activation_state as ActivationState) ?? (IN_APP_CHANNELS.includes(change.channelType) ? "ACTIVE" : "DISABLED");
  if (current === change.to) throw new OrderEngineError("INVALID_INPUT", `The channel is already ${current}.`);
  if (!ALLOWED_TRANSITIONS[current].includes(change.to)) {
    throw new OrderEngineError("INVALID_TRANSITION", `A channel that is ${current} cannot move straight to ${change.to}. Allowed: ${ALLOWED_TRANSITIONS[current].join(", ")}.`);
  }

  const reason = cleanText(change.reason, 500);
  if (change.to === "SUSPENDED" && !reason) throw new OrderEngineError("INVALID_INPUT", "A reason is required to suspend a channel.");
  const uatReference = cleanText(change.uatReference, 200);
  if (change.to === "UAT_PASSED" && !uatReference) {
    throw new OrderEngineError("INVALID_INPUT", "Recording UAT as passed needs its evidence (the UAT run or document reference).");
  }

  if (change.to === "ACTIVE") {
    const readiness = channelReadinessFor({
      channelType: change.channelType,
      channelKey,
      settings: await loadOrderSettings(supabase, companyId),
      channel: existing,
      mailboxes: await listMailboxes(supabase, companyId),
      productLinks: 0,
      exceptionCount: 0,
    });
    // Web stores are the only channel whose product links matter for activation.
    if (change.channelType === "web_store") {
      const { data } = await supabase
        .from("vyron_import_source_links")
        .select("source_system")
        .eq("company_id", companyId)
        .eq("entity_type", "product")
        .eq("source_system", channelKey);
      const links = (data || []).length;
      readiness.requirements = webStoreRequirements(await loadOrderSettings(supabase, companyId), existing, links);
      readiness.blockedBy = readiness.requirements.filter((r) => !r.met).map((r) => r.label);
    }
    if (readiness.blockedBy.length) {
      throw new OrderEngineError("INVALID_INPUT", `This channel is not ready to activate: ${readiness.blockedBy.join("; ")}.`);
    }
    if (existing?.uat_passed_at === null || existing?.uat_passed_at === undefined) {
      if (!IN_APP_CHANNELS.includes(change.channelType)) {
        throw new OrderEngineError("INVALID_INPUT", "UAT must be recorded as passed before a channel is activated.");
      }
    }
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    activation_state: change.to,
    suspended_reason: change.to === "SUSPENDED" ? reason : null,
    updated_by: actor.userId,
    updated_by_name: actor.name,
    updated_at: now,
  };
  if (change.to === "UAT_PASSED") {
    patch.uat_passed_at = now;
    patch.uat_reference = uatReference;
  }
  if (change.to === "ACTIVE") {
    patch.activated_at = now;
    patch.activated_by = actor.userId;
    patch.enabled = true;
  }
  if (change.to === "DISABLED") {
    patch.enabled = false;
    patch.activated_at = null;
    patch.activated_by = null;
  }

  if (existing) {
    const { error } = await supabase.from("vyron_order_channel_settings").update(patch).eq("company_id", companyId).eq("id", existing.id);
    if (error) {
      if (isMissingRelation(error)) throw new OrderEngineError("NOT_ENABLED", "Channel activation is not enabled on this database yet.");
      raiseDbError(error, "Channel activation failed");
    }
  } else {
    const { error } = await supabase.from("vyron_order_channel_settings").insert({
      company_id: companyId,
      channel_key: channelKey,
      channel_type: change.channelType,
      enabled: change.to === "ACTIVE",
      created_at: now,
      ...patch,
    });
    if (error) {
      if (isMissingRelation(error)) throw new OrderEngineError("NOT_ENABLED", "Channel activation is not enabled on this database yet.");
      raiseDbError(error, "Channel activation failed");
    }
  }
  return loadChannelReadiness(supabase, companyId);
}

/**
 * A connector may only hand work in while its channel is ACTIVE. In-app
 * channels (manual, CSV, Excel) are live unless a tenant disabled them.
 */
export async function assertChannelActive(supabase: SupabaseClient, companyId: string, channelType: ChannelType, channelKey?: string | null): Promise<void> {
  const key = cleanText(channelKey, 160) || channelType;
  const existing = await findChannelRow(supabase, companyId, channelType, key);
  const state: ActivationState = (existing?.activation_state as ActivationState) ?? (IN_APP_CHANNELS.includes(channelType) ? "ACTIVE" : "DISABLED");
  if (state === "ACTIVE") return;
  throw new OrderEngineError(
    "NOT_ENABLED",
    state === "SUSPENDED"
      ? `The ${channelType} channel is suspended${existing?.suspended_reason ? `: ${existing.suspended_reason}` : "."}`
      : `The ${channelType} channel is not active (${state}). Activate it in Order rules once it is ready.`
  );
}

/**
 * Record what a channel just did. The first order a live channel produces is
 * also recorded, so "has this path ever been walked end to end?" is answerable.
 */
export async function recordChannelActivity(
  supabase: SupabaseClient,
  companyId: string,
  input: { channelType: ChannelType; channelKey?: string | null; ok: boolean; reason?: string | null; intakeId?: string | null }
): Promise<void> {
  const key = cleanText(input.channelKey, 160) || input.channelType;
  const existing = await findChannelRow(supabase, companyId, input.channelType, key);
  if (!existing) return; // nothing configured for this channel: nothing to record against
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = input.ok
    ? { last_success_at: now, updated_at: now }
    : { last_failure_at: now, last_failure_reason: cleanText(input.reason, 500), updated_at: now };
  if (input.ok && input.intakeId && !existing.first_live_intake_id && existing.activation_state === "ACTIVE") {
    patch.first_live_intake_id = input.intakeId;
    patch.first_live_at = now;
  }
  const { error } = await supabase.from("vyron_order_channel_settings").update(patch).eq("company_id", companyId).eq("id", existing.id);
  if (error && !isMissingRelation(error)) raiseDbError(error, "Record channel activity failed");
}

/** Is this intake the first live order from its channel? */
export async function isFirstLiveOrder(supabase: SupabaseClient, companyId: string, intakeId: string, channelType: ChannelType, channelKey?: string | null): Promise<boolean> {
  const key = cleanText(channelKey, 160) || channelType;
  const existing = await findChannelRow(supabase, companyId, channelType, key);
  return Boolean(existing?.first_live_intake_id && existing.first_live_intake_id === intakeId);
}
