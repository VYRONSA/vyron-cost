/**
 * Admin GraphQL documents. Every money field is read in SHOP currency
 * (`shopMoney`) — the currency the business books in — never the buyer's
 * presentment currency.
 *
 * The order query is kept small enough for Shopify's query-cost limit:
 * line items page by 50, and each refund is fetched on its own.
 */

const MONEY = "shopMoney { amount currencyCode }";

const LINE_ITEM_FIELDS = `
  id
  sku
  name
  quantity
  currentQuantity
  taxable
  variant { legacyResourceId }
  product { legacyResourceId }
  originalUnitPriceSet { ${MONEY} }
  discountAllocations { allocatedAmountSet { ${MONEY} } }
  taxLines { ratePercentage priceSet { ${MONEY} } }
`;

export const ORDER_QUERY = `
query VolSaleOrder($id: ID!) {
  shop { ianaTimezone currencyCode }
  order(id: $id) {
    id
    legacyResourceId
    name
    createdAt
    processedAt
    updatedAt
    test
    cancelledAt
    cancelReason
    displayFinancialStatus
    currencyCode
    taxesIncluded
    email
    customer { legacyResourceId displayName defaultEmailAddress { emailAddress } }
    subtotalPriceSet { ${MONEY} }
    totalPriceSet { ${MONEY} }
    totalTaxSet { ${MONEY} }
    totalDiscountsSet { ${MONEY} }
    totalShippingPriceSet { ${MONEY} }
    totalRefundedSet { ${MONEY} }
    lineItems(first: 50) {
      pageInfo { hasNextPage endCursor }
      nodes { ${LINE_ITEM_FIELDS} }
    }
    shippingLines(first: 10) {
      nodes {
        id
        title
        isRemoved
        originalPriceSet { ${MONEY} }
        discountAllocations { allocatedAmountSet { ${MONEY} } }
        taxLines { ratePercentage priceSet { ${MONEY} } }
      }
    }
    refunds(first: 50) { id }
  }
}`;

export const ORDER_LINE_ITEMS_PAGE_QUERY = `
query VolSaleOrderLines($id: ID!, $after: String) {
  order(id: $id) {
    lineItems(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ${LINE_ITEM_FIELDS} }
    }
  }
}`;

export const REFUND_QUERY = `
query VolSaleRefund($id: ID!) {
  refund(id: $id) {
    id
    legacyResourceId
    createdAt
    note
    totalRefundedSet { ${MONEY} }
    refundLineItems(first: 100) {
      pageInfo { hasNextPage }
      nodes {
        quantity
        lineItem { id }
        subtotalSet { ${MONEY} }
        totalTaxSet { ${MONEY} }
      }
    }
    refundShippingLines(first: 10) {
      nodes { subtotalAmountSet { ${MONEY} } taxAmountSet { ${MONEY} } }
    }
  }
}`;

/** One page of order ids: oldest first by creation (import) or by last update (catch-up). */
export const ORDER_IDS_PAGE_QUERY = `
query VolSaleOrderIds($first: Int!, $after: String, $query: String, $sortKey: OrderSortKeys!) {
  orders(first: $first, after: $after, sortKey: $sortKey, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes { legacyResourceId }
  }
}`;

export const SHOP_QUERY = `
query VolSaleShop {
  shop { name myshopifyDomain currencyCode ianaTimezone }
}`;

export const WEBHOOK_SUBSCRIPTIONS_QUERY = `
query VolSaleWebhooks {
  webhookSubscriptions(first: 50) {
    nodes { id topic uri }
  }
}`;

export const WEBHOOK_SUBSCRIPTION_CREATE = `
mutation VolSaleWebhookCreate($topic: WebhookSubscriptionTopic!, $uri: String!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri }) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}`;

export function orderGid(orderId: string): string {
  return `gid://shopify/Order/${orderId}`;
}
