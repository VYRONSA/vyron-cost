import { buildHeaderIndex, neutraliseFormulaInjection, parseDelimitedTable } from "@/lib/vyron-csv-parser";
import { cleanText, stableHash, toIsoDateOrNull, toNumberOrNull } from "@/lib/order-engine/normalize";
import type { OrderCandidate, OrderSource } from "@/lib/order-engine/types";
import { OrderSourceParseError, type OrderSourceAdapter } from "@/lib/order-engine/adapters/types";

/**
 * A customer order as a CSV file: one row per line. Headers are matched
 * exactly (case-insensitive) against a fixed list of names — no guessing of
 * what an unknown column might mean. Header-level values (customer, PO,
 * delivery date …) may appear on every row but must then agree; a file that
 * contradicts itself is refused rather than half-read.
 *
 * The source key is the SHA-256 of the file content, so uploading the same file
 * twice returns the order already received.
 */

const COLUMN_ALIASES: Record<string, string[]> = {
  sku: ["sku", "item_code", "product_code", "code"],
  description: ["description", "product", "product_name", "item", "item_description"],
  quantity: ["quantity", "qty"],
  unitPrice: ["unit_price", "price"],
  discount: ["discount", "discount_amount"],
  lineTotal: ["line_total", "total"],
  unit: ["unit", "uom"],
  lineReference: ["line_ref", "line_reference", "line"],
  customer: ["customer", "customer_name"],
  poNumber: ["po_number", "po", "customer_po", "purchase_order"],
  deliveryDate: ["requested_delivery_date", "delivery_date"],
  orderNumber: ["order_number", "external_order_number"],
  orderDate: ["order_date"],
  currency: ["currency"],
  notes: ["notes"],
};

const HEADER_LEVEL = ["customer", "poNumber", "deliveryDate", "orderNumber", "orderDate", "currency", "notes"] as const;

export type CsvOrderInput = {
  text: string;
  fileName?: string | null;
  /** The source the file arrived through: an upload is "csv", an e-mail attachment is "email". */
  source?: Extract<OrderSource, "csv" | "email">;
  /** Overrides the content-hash key (an e-mail uses message id + file name). */
  sourceKey?: string | null;
  senderEmail?: string | null;
};

function resolveColumns(header: string[]) {
  const index = buildHeaderIndex(header.map((h) => h.replace(/\s+/g, "_")));
  const columns: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const found = aliases.map((alias) => index.get(alias)).find((position) => position !== undefined);
    if (found !== undefined) columns[key as keyof typeof COLUMN_ALIASES] = found;
  }
  return columns;
}

export function parseCsvOrder(input: CsvOrderInput): OrderCandidate {
  const text = String(input.text ?? "");
  if (!text.trim()) throw new OrderSourceParseError("The file is empty.");
  if (text.length > 2_000_000) throw new OrderSourceParseError("The file is larger than 2 MB.");

  const table = parseDelimitedTable(text);
  const columns = resolveColumns(table.header);
  if (columns.quantity === undefined) throw new OrderSourceParseError('The file needs a "quantity" column.');
  if (columns.sku === undefined && columns.description === undefined) {
    throw new OrderSourceParseError('The file needs a "sku" or "description" column.');
  }

  const cell = (record: string[], key: keyof typeof COLUMN_ALIASES): string | null => {
    const position = columns[key];
    if (position === undefined) return null;
    // Trim first so a leading space cannot hide a formula from the neutraliser.
    return cleanText(neutraliseFormulaInjection(String(record[position] ?? "").trim()), 1000);
  };

  const headerValues: Partial<Record<(typeof HEADER_LEVEL)[number], string>> = {};
  const lines: OrderCandidate["lines"] = [];
  for (const row of table.rows) {
    if (row.isBlank) continue;
    for (const key of HEADER_LEVEL) {
      const value = cell(row.record, key);
      if (!value) continue;
      if (headerValues[key] && headerValues[key] !== value) {
        throw new OrderSourceParseError(`Row ${row.lineNumber}: ${key} "${value}" contradicts "${headerValues[key]}" on an earlier row.`);
      }
      headerValues[key] = value;
    }
    const quantityText = cell(row.record, "quantity");
    const quantity = toNumberOrNull(quantityText);
    if (quantity === null) throw new OrderSourceParseError(`Row ${row.lineNumber}: quantity "${quantityText ?? ""}" is not a number.`);
    const unitPriceText = cell(row.record, "unitPrice");
    const unitPrice = toNumberOrNull(unitPriceText);
    if (unitPriceText && unitPrice === null) throw new OrderSourceParseError(`Row ${row.lineNumber}: price "${unitPriceText}" is not a number.`);
    lines.push({
      sourceLineReference: cell(row.record, "lineReference") || `row-${row.lineNumber}`,
      sku: cell(row.record, "sku"),
      description: cell(row.record, "description"),
      unit: cell(row.record, "unit"),
      quantity,
      unitPrice,
      discountAmount: toNumberOrNull(cell(row.record, "discount")),
      lineTotal: toNumberOrNull(cell(row.record, "lineTotal")),
    });
  }
  if (!lines.length) throw new OrderSourceParseError("The file has no order lines.");

  for (const [key, value] of [
    ["delivery date", headerValues.deliveryDate],
    ["order date", headerValues.orderDate],
  ] as const) {
    if (value && !toIsoDateOrNull(value)) throw new OrderSourceParseError(`The ${key} "${value}" must be written YYYY-MM-DD.`);
  }

  return {
    source: input.source || "csv",
    sourceKey: cleanText(input.sourceKey, 300) || `sha256:${stableHash(text)}`,
    sourceReference: cleanText(input.fileName, 200) || "CSV upload",
    customerName: headerValues.customer ?? null,
    customerReference: input.senderEmail ?? null,
    senderEmail: input.senderEmail ?? null,
    customerPoNumber: headerValues.poNumber ?? null,
    requestedDeliveryDate: headerValues.deliveryDate ?? null,
    externalOrderNumber: headerValues.orderNumber ?? null,
    orderDate: headerValues.orderDate ?? null,
    currency: headerValues.currency ?? null,
    notes: headerValues.notes ?? null,
    lines,
  };
}

export const csvOrderAdapter: OrderSourceAdapter<CsvOrderInput> = {
  source: "csv",
  connected: true,
  normalize: parseCsvOrder,
};

/** The template the Order Inbox offers for download. */
export const CSV_ORDER_TEMPLATE =
  "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price\n" +
  "Example Customer,PO-1001,2026-10-01,SKU-001,Example product,10,25.00\n";
