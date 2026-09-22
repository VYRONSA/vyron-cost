import type { IssueCategory, IssueSeverity } from "@/lib/order-engine/types";

/**
 * Every validation issue the Order Engine can raise: what it means, whether it
 * blocks approval, and what a person must do. The UI's Exception Centre and
 * docs/order-engine/VALIDATION_RULES.md are both driven from this table.
 *
 * `source` says where the rule comes from:
 *   core     always on — a fact about the order that is never a matter of policy
 *   policy   only when a customer order policy switches it on (off by default)
 *   source   raised because of what the source itself stated
 */
export type IssueDefinition = {
  code: string;
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  source: "core" | "policy" | "source";
  action: string;
  /** Names used for the same rule in the product brief. */
  aka?: string[];
};

const def = (d: IssueDefinition) => d;

export const ISSUE_CATALOG: Record<string, IssueDefinition> = Object.fromEntries(
  [
    def({ code: "CUSTOMER_NOT_FOUND", title: "Customer not identified", category: "customer", severity: "error", source: "core", action: "Choose the customer. Optionally remember the order's customer reference for next time.", aka: ["UNMATCHED_CUSTOMER"] }),
    def({ code: "CUSTOMER_AMBIGUOUS", title: "More than one possible customer", category: "customer", severity: "error", source: "core", action: "Choose which customer placed the order." }),
    def({ code: "CUSTOMER_INACTIVE", title: "Customer is not active", category: "customer", severity: "error", source: "core", action: "Reactivate the customer in the Customer Register, or reject the order." }),
    def({ code: "CUSTOMER_ON_HOLD", title: "Customer is on hold", category: "customer", severity: "warning", source: "core", action: "Confirm the order may proceed while the customer is on hold." }),
    def({ code: "CUSTOMER_MATCHED_BY_EMAIL", title: "Customer identified by sender e-mail only", category: "customer", severity: "warning", source: "core", action: "Confirm the sender really is this customer." }),
    def({ code: "PRODUCT_UNMATCHED", title: "Product not identified", category: "product", severity: "error", source: "core", action: "Choose the product. Optionally remember the customer's item code for next time.", aka: ["UNMATCHED_PRODUCT"] }),
    def({ code: "PRODUCT_AMBIGUOUS", title: "More than one possible product", category: "product", severity: "error", source: "core", action: "Choose between the listed products.", aka: ["AMBIGUOUS_PRODUCT"] }),
    def({ code: "PRODUCT_MATCHED_BY_NAME", title: "Product identified by name only", category: "product", severity: "warning", source: "core", action: "Confirm the product — the line had no SKU." }),
    def({ code: "DUPLICATE_PRODUCT_LINE", title: "Same product on two lines", category: "product", severity: "warning", source: "core", action: "Confirm both lines are intended." }),
    def({ code: "INVALID_QUANTITY", title: "Quantity is not a positive number", category: "quantity", severity: "error", source: "core", action: "Correct the quantity with the customer." }),
    def({ code: "CASE_QUANTITY", title: "Not a whole number of cases", category: "policy", severity: "warning", source: "policy", action: "Confirm the quantity, or round to whole cases with the customer." }),
    def({ code: "PRICE_LOOKUP_FAILED", title: "Price could not be looked up", category: "price", severity: "error", source: "core", action: "Check the product and the customer's price list, then validate again." }),
    def({ code: "PRICE_MISSING", title: "No price", category: "price", severity: "error", source: "core", action: "Enter the agreed price, or set a price for the product." }),
    def({ code: "PRICE_NEGATIVE", title: "Negative price", category: "price", severity: "error", source: "core", action: "Correct the price." }),
    def({ code: "PRICE_ZERO", title: "Zero price", category: "price", severity: "error", source: "core", action: "Enter the price or remove the line — Sales Orders cannot carry a free line without substituting a price." }),
    def({ code: "PRICE_MISMATCH", title: "Price differs from VOLORA's price", category: "price", severity: "warning", source: "core", action: "Confirm the order price, or correct it to the price list." }),
    def({ code: "PRICE_FROM_VYRON", title: "Price taken from VOLORA", category: "price", severity: "info", source: "core", action: "None — the order had no price, so the customer or standard price is used." }),
    def({ code: "INSUFFICIENT_STOCK", title: "Not enough stock", category: "stock", severity: "warning", source: "core", action: "Confirm the order may proceed; plan production or a partial delivery." }),
    def({ code: "PRODUCTION_REQUIRED", title: "Production required", category: "production", severity: "info", source: "core", action: "None now — the sales order can raise the production run." }),
    def({ code: "NO_BOM_FOR_SHORTFALL", title: "Short with no BOM to produce it", category: "production", severity: "warning", source: "core", action: "Confirm how the shortfall will be supplied." }),
    def({ code: "NEGATIVE_MARGIN", title: "Selling below cost", category: "margin", severity: "warning", source: "core", action: "Confirm the price is intended." }),
    def({ code: "LOW_MARGIN", title: "Margin below the customer's minimum", category: "margin", severity: "warning", source: "policy", action: "Confirm the price is intended." }),
    def({ code: "MARGIN_NOT_MEASURED", title: "Margin not measured", category: "margin", severity: "info", source: "core", action: "None — some products have no cost in VOLORA." }),
    def({ code: "DELIVERY_DATE_PAST", title: "Delivery date is in the past", category: "commercial", severity: "warning", source: "core", action: "Agree a new delivery date with the customer.", aka: ["PAST_DELIVERY_DATE"] }),
    def({ code: "POSSIBLE_DUPLICATE_PO", title: "PO already received", category: "commercial", severity: "warning", source: "core", action: "Check it is not a duplicate of the listed order(s).", aka: ["DUPLICATE_ORDER"] }),
    def({ code: "NO_LINES", title: "No lines", category: "commercial", severity: "error", source: "core", action: "Reject or cancel the order." }),
    def({ code: "MISSING_PO", title: "PO number required", category: "policy", severity: "error", source: "policy", action: "Get the PO number from the customer and enter it." }),
    def({ code: "MISSING_DELIVERY_DATE", title: "Delivery date required", category: "policy", severity: "error", source: "policy", action: "Agree a delivery date with the customer and enter it." }),
    def({ code: "BELOW_MINIMUM_ORDER", title: "Below the customer's minimum order", category: "policy", severity: "warning", source: "policy", action: "Confirm the order may proceed below the minimum." }),
    def({ code: "DELIVERY_DAY_NOT_ALLOWED", title: "Not a delivery day for this customer", category: "policy", severity: "warning", source: "policy", action: "Confirm the delivery date with the customer." }),
    def({ code: "SPECIAL_INSTRUCTIONS", title: "Customer special instructions", category: "policy", severity: "info", source: "policy", action: "Read the instructions before approving." }),
    def({ code: "LINE_TOTAL_MISMATCH", title: "Line total does not add up", category: "arithmetic", severity: "warning", source: "source", action: "Check quantity, price and discount against the customer's order.", aka: ["INVALID_TOTAL"] }),
    def({ code: "SUBTOTAL_MISMATCH", title: "Order subtotal does not add up", category: "arithmetic", severity: "warning", source: "source", action: "Check the lines against the customer's order.", aka: ["INVALID_TOTAL"] }),
    def({ code: "PRICES_INCLUDE_TAX", title: "Source prices include tax", category: "tax", severity: "error", source: "source", action: "Enter ex-tax prices and confirm the conversion — Sales Orders add tax on top." }),
    def({ code: "SHIPPING_NOT_CARRIED", title: "Shipping charge not carried", category: "tax", severity: "warning", source: "source", action: "Confirm how the stated shipping charge will be billed; it is not added to the sales order." }),
    def({ code: "SOURCE_PARTIAL_REFUND", title: "Already partly refunded at source", category: "tax", severity: "warning", source: "source", action: "Confirm which items are still to be supplied before approving." }),
    def({ code: "COUPON_APPLIED", title: "Coupon applied at source", category: "tax", severity: "info", source: "source", action: "None — line discounts already include it." }),
    def({ code: "EXTRACTION_REVIEW", title: "Read automatically — review", category: "extraction", severity: "warning", source: "source", action: "Check the extracted values against the original document." }),
    def({ code: "EXTRACTION_LOW_CONFIDENCE", title: "Uncertain extracted value", category: "extraction", severity: "error", source: "source", action: "Correct or confirm the value from the original document." }),
    def({ code: "B2C_ACCOUNT_NOT_CONFIGURED", title: "No B2C account decided", category: "customer", severity: "error", source: "policy", action: "Choose the customer for this web order, or set the company's B2C account in Order rules once the business has decided how web orders are booked." }),
    def({ code: "ORDER_CONTEXT_UNSPECIFIED", title: "B2B or B2C not stated", category: "customer", severity: "info", source: "source", action: "None — the source did not say whether this is a trade or a web order." }),
    def({ code: "POSSIBLE_DUPLICATE_ORDER", title: "Order reference already received", category: "commercial", severity: "warning", source: "core", action: "Check the earlier order with the same reference before approving; reject this one if it is a repeat.", aka: ["DUPLICATE_ORDER"] }),
    def({ code: "DELIVERY_LEAD_TIME", title: "Inside the lead time", category: "commercial", severity: "warning", source: "policy", action: "Confirm the delivery date can be met, or agree a later date with the customer." }),
    def({ code: "COMPONENT_SHORTAGE", title: "Components short for production", category: "production", severity: "warning", source: "core", action: "Check component stock and purchasing before committing to the delivery date." }),
    def({ code: "SOURCE_VALUE_CHANGED", title: "Changed from what the customer sent", category: "commercial", severity: "warning", source: "core", action: "Confirm the change was agreed with the customer; the original values are kept on the order." }),
    def({ code: "DOCUMENT_NEEDS_EXTRACTION", title: "Document not read yet", category: "extraction", severity: "error", source: "source", action: "Enter the order manually from the document, or process it through a document extractor.", aka: ["UNSUPPORTED_DOCUMENT"] }),
    def({ code: "WEB_ORDERS_MODE_NOT_DECIDED", title: "Web orders: fulfil or history not decided", category: "commercial", severity: "error", source: "policy", action: "Decide in Order rules whether web-store orders are fulfilled in VOLORA or kept as historical sales." }),
    def({ code: "WEB_STATUS_NOT_ELIGIBLE", title: "Store status not fulfilled", category: "commercial", severity: "error", source: "policy", action: "Check the order in the store, or add this status to the channel's eligible statuses." }),
    def({ code: "WEB_VAT_BASIS_UNKNOWN", title: "Store VAT basis not stated", category: "tax", severity: "warning", source: "policy", action: "Set the channel's VAT basis in Order rules, or confirm the prices are ex-tax before approving." }),
    def({ code: "EMAIL_NOT_ACCEPTED", title: "E-mail held for review", category: "extraction", severity: "error", source: "source", action: "Check the sender and attachments; add the sender to the mailbox policy if the message is genuine." }),
    def({
      code: "FIRST_LIVE_ORDER_FROM_CHANNEL",
      title: "First live order from this channel",
      category: "commercial",
      severity: "warning",
      source: "policy",
      action: "Check this order against what the customer actually sent before approving: it is the first one this channel has produced since it was activated.",
    }),
  ].map((d) => [d.code, d])
);

export function issueDefinition(code: string): IssueDefinition | null {
  return ISSUE_CATALOG[code] || null;
}
