import type { SupabaseClient } from "@supabase/supabase-js";
import { listMailboxes } from "@/lib/order-engine/mailboxes";
import { listOrderPolicies } from "@/lib/order-engine/policies";
import { listChannelSettings, loadOrderSettings, type ChannelSettings, type EffectiveOrderSettings } from "@/lib/order-engine/settings";
import { listPdfExtractors } from "@/lib/order-engine/extractors/pdf";

/**
 * The ordering decision register.
 *
 * Every business decision the Order Engine needs is listed here with its
 * current state: CONFIGURED (a person decided it) or AWAITING_DECISION (nobody
 * has). A missing decision is never a business rule: each entry states what
 * the engine does until it is made, and whether that stops orders.
 *
 * The same register drives the Order rules screen and
 * docs/order-engine/FOOD_SOCK_OPEN_DECISIONS.md.
 */

export type DecisionState = "CONFIGURED" | "AWAITING_DECISION";

export type OrderingDecision = {
  id: string;
  title: string;
  state: DecisionState;
  /** What is configured now, in words. */
  current: string;
  /** What the engine does while the decision is missing. */
  untilDecided: string;
  /** Does the missing decision stop orders? */
  blocks: boolean;
  /** Where it is set. */
  setIn: "ordering settings" | "channel settings" | "customer rules" | "mailboxes" | "workspace roles";
};

const yesNo = (value: boolean | null, yes: string, no: string, unknown: string) => (value === null ? unknown : value ? yes : no);

export function buildDecisionRegister(input: {
  settings: EffectiveOrderSettings;
  channels: ChannelSettings[];
  policies: Array<{ customer_id: string | null }>;
  mailboxes: Array<{ status: string; allowed_sender_domains: string[] | null; allowed_senders: string[] | null }>;
  extractors: string[];
}): OrderingDecision[] {
  const { settings, channels, policies, mailboxes, extractors } = input;
  const customerRules = policies.filter((p) => p.customer_id).length;
  const companyRule = policies.some((p) => !p.customer_id);
  const activeMailboxes = mailboxes.filter((m) => m.status === "ACTIVE");
  const channelsWithVat = channels.filter((c) => typeof c.prices_include_tax === "boolean");
  const channelsWithStatuses = channels.filter((c) => Array.isArray(c.eligible_statuses) && c.eligible_statuses.length);

  return [
    {
      id: "D1",
      title: "Are web-store orders fulfilled in VOLORA, or history only?",
      state: settings.webOrdersMode ? "CONFIGURED" : "AWAITING_DECISION",
      current: settings.webOrdersMode === "fulfil" ? "Fulfilled in VOLORA" : settings.webOrdersMode === "history_only" ? "Historical sales only" : "Not decided",
      untilDecided: "Web-store orders are not received as orders to fulfil.",
      blocks: true,
      setIn: "ordering settings",
    },
    {
      id: "D2",
      title: "How are B2C web orders booked?",
      state: settings.b2cCustomerId ? "CONFIGURED" : "AWAITING_DECISION",
      current: settings.b2cCustomerId ? "A chosen B2C account" : "Not decided",
      untilDecided: "A web order from an unknown customer stops in Exceptions.",
      blocks: true,
      setIn: "ordering settings",
    },
    {
      id: "D3",
      title: "Do store prices include VAT?",
      state: settings.webPricesIncludeTax !== null || channelsWithVat.length ? "CONFIGURED" : "AWAITING_DECISION",
      current: channelsWithVat.length
        ? `${channelsWithVat.length} channel(s) state their VAT basis`
        : yesNo(settings.webPricesIncludeTax, "Prices include VAT", "Prices exclude VAT", "Not decided"),
      untilDecided: "Each order is taken as the store states it; a tax-inclusive order stops until a person enters ex-tax prices.",
      blocks: false,
      setIn: "channel settings",
    },
    {
      id: "D4",
      title: "How is shipping billed?",
      state: settings.shippingTreatment ? "CONFIGURED" : "AWAITING_DECISION",
      current:
        settings.shippingTreatment === "separate_line"
          ? "Billed as a separate line (added by a person)"
          : settings.shippingTreatment === "absorbed"
            ? "Absorbed — not billed"
            : settings.shippingTreatment === "not_carried"
              ? "Not carried onto the sales order"
              : "Not decided",
      untilDecided: "A stated shipping charge is shown as a warning and is not added to the sales order.",
      blocks: false,
      setIn: "ordering settings",
    },
    {
      id: "D5",
      title: "Which customers need a PO, delivery date, delivery days, minimum order, whole cases or minimum margin?",
      state: customerRules > 0 || companyRule ? "CONFIGURED" : "AWAITING_DECISION",
      current: customerRules > 0 ? `${customerRules} customer rule(s)${companyRule ? " and a company default" : ""}` : companyRule ? "A company default only" : "No rules configured",
      untilDecided: "No customer rule is applied.",
      blocks: false,
      setIn: "customer rules",
    },
    {
      id: "D6",
      title: "A repeated customer PO or order reference: warn or block?",
      state: "CONFIGURED",
      current: settings.duplicatePoAction === "block" ? "Blocks in Exceptions" : "Warns; the approver acknowledges it",
      untilDecided: "Warns (the safe default).",
      blocks: false,
      setIn: "ordering settings",
    },
    {
      id: "D7",
      title: "May a line without a SKU match by exact product name?",
      state: "CONFIGURED",
      current: settings.productNameMatching === "off" ? "Off — a person decides every SKU-less line" : "Allowed, always raised for review",
      untilDecided: "Allowed with review (the safe default).",
      blocks: false,
      setIn: "ordering settings",
    },
    {
      id: "D8",
      title: "Minimum lead time between order and delivery?",
      state: settings.minLeadTimeDays === null ? "AWAITING_DECISION" : "CONFIGURED",
      current: settings.minLeadTimeDays === null ? "Not checked" : `${settings.minLeadTimeDays} day(s)`,
      untilDecided: "Delivery dates are not checked against a lead time.",
      blocks: false,
      setIn: "ordering settings",
    },
    {
      id: "D9",
      title: "Do source SKUs equal VOLORA SKUs, or is a mapping required?",
      state: settings.skuAlignment ? "CONFIGURED" : "AWAITING_DECISION",
      current: settings.skuAlignment === "source_equals_vyron" ? "Source SKUs are VOLORA SKUs" : settings.skuAlignment === "mapping_required" ? "A mapping is required per customer / channel" : "Not decided",
      untilDecided: "Exact SKU matching only; anything unmatched stops in Exceptions (never guessed).",
      blocks: false,
      setIn: "ordering settings",
    },
    {
      id: "D10",
      title: "Which web-store statuses mean ready to fulfil?",
      state: channelsWithStatuses.length || settings.webOrderStatuses ? "CONFIGURED" : "AWAITING_DECISION",
      current: channelsWithStatuses.length
        ? `${channelsWithStatuses.length} channel(s) list their statuses`
        : settings.webOrderStatuses
          ? settings.webOrderStatuses.join(", ")
          : "Not decided",
      untilDecided: "Cancelled, refunded, failed and draft orders are refused; every other status is received for review.",
      blocks: false,
      setIn: "channel settings",
    },
    {
      id: "D11",
      title: "May the person who enters an order approve it?",
      state: settings.creatorCanApprove === null ? "AWAITING_DECISION" : "CONFIGURED",
      current: yesNo(settings.creatorCanApprove, "Yes — the creator may approve", "No — someone else must approve", "Not decided"),
      untilDecided: "Approval needs the approve permission; separation of duties is not enforced.",
      blocks: false,
      setIn: "workspace roles",
    },
    {
      id: "D12",
      title: "Which mailbox receives orders, and which extractor reads PDFs?",
      state: activeMailboxes.length && settings.pdfExtractor ? "CONFIGURED" : "AWAITING_DECISION",
      current: `${activeMailboxes.length} active mailbox(es); ${settings.pdfExtractor ? `PDF extractor "${settings.pdfExtractor}"` : "no PDF extractor"}${extractors.length ? ` (available: ${extractors.join(", ")})` : " (no provider available in this build)"}`,
      untilDecided: "No mailbox is connected; PDFs are held as documents needing extraction.",
      blocks: true,
      setIn: "mailboxes",
    },
  ];
}

/** The decision register for a company, read from its live configuration. */
export async function loadDecisionRegister(supabase: SupabaseClient, companyId: string): Promise<OrderingDecision[]> {
  const [settings, channels, policies, mailboxes] = await Promise.all([
    loadOrderSettings(supabase, companyId),
    listChannelSettings(supabase, companyId),
    listOrderPolicies(supabase, companyId).catch(() => []),
    listMailboxes(supabase, companyId),
  ]);
  return buildDecisionRegister({ settings, channels, policies, mailboxes, extractors: listPdfExtractors() });
}
