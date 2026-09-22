import { buildHeaderIndex, neutraliseFormulaInjection, parseDelimitedTable } from "@/lib/vyron-csv-parser";
import { cleanText, stableHash, toIsoDateOrNull } from "@/lib/order-engine/normalize";
import type { OrderCandidate, OrderSource } from "@/lib/order-engine/types";
import { OrderSourceParseError, type OrderSourceAdapter } from "@/lib/order-engine/adapters/types";

/**
 * A customer order as a CSV file: one row per line. Headers are matched
 * exactly (case-insensitive) against a fixed list of names — no guessing of
 * what an unknown column might mean. Header-level values (customer, PO,
 * delivery date …) may appear on every row but must then agree; a file that
 * contradicts itself is refused rather than half-read.
 *
 * Nothing ambiguous is reinterpreted. A number whose decimal separator cannot
 * be known ("1,50"), a date that is not unambiguous ISO ("05/06/2026"), a
 * quantity with a unit in it ("10 cases") and an unclear VAT flag are all
 * refused with the value quoted back, so a person decides. Columns the
 * template does not define are ignored but reported on the order, so nobody
 * assumes a column was read.
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
  tax: ["tax", "tax_amount", "vat", "vat_amount"],
  unit: ["unit", "uom"],
  lineReference: ["line_ref", "line_reference", "line"],
  customer: ["customer", "customer_name"],
  poNumber: ["po_number", "po", "customer_po", "purchase_order"],
  deliveryDate: ["requested_delivery_date", "delivery_date"],
  orderNumber: ["order_number", "external_order_number"],
  orderDate: ["order_date"],
  currency: ["currency"],
  notes: ["notes"],
  customerReference: ["customer_reference", "customer_code", "account", "account_number", "account_code"],
  pricesIncludeTax: ["prices_include_tax", "prices_include_vat", "vat_inclusive", "tax_inclusive"],
};

const HEADER_LEVEL = ["customer", "poNumber", "deliveryDate", "orderNumber", "orderDate", "currency", "notes", "customerReference", "pricesIncludeTax"] as const;

const YES = new Set(["yes", "y", "true", "1", "incl", "inclusive", "vat inclusive", "including vat", "tax inclusive"]);
const NO = new Set(["no", "n", "false", "0", "excl", "exclusive", "vat exclusive", "excluding vat", "tax exclusive", "ex vat", "ex-vat"]);

/**
 * A number, or an explanation of why it cannot be read. Thousands separators
 * are accepted only in an unambiguous grouping ("1,234.50"); anything else
 * with a comma is refused rather than guessed ("1,50" is 1.50 in one country
 * and 150 in another).
 */
function strictNumber(text: string): { value: number } | { error: string } {
  const raw = text.trim();
  if (!raw) return { error: "is empty" };
  const withoutCurrency = raw.replace(/^[A-Za-z$€£]{1,3}\s*/, "").replace(/\s*[A-Za-z]{2,3}$/, "").trim();
  if (/[A-Za-z]/.test(withoutCurrency)) return { error: `"${raw}" is not a plain number (remove units and text)` };
  if (withoutCurrency.includes(",")) {
    const grouped = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(withoutCurrency);
    if (!grouped) {
      return { error: `"${raw}" is ambiguous: write a full stop for the decimal point and no thousands separator (1234.50)` };
    }
  }
  const cleaned = withoutCurrency.replace(/,/g, "").replace(/\s/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return { error: `"${raw}" is not a number` };
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { error: `"${raw}" is not a number` };
  return { value };
}

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
  // Two columns meaning the same thing is ambiguous: refuse rather than pick one.
  const seenAliases = new Map<string, string[]>();
  for (const head of table.header) {
    const key = head.trim().toLowerCase().replace(/\s+/g, "_");
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(key)) seenAliases.set(field, [...(seenAliases.get(field) || []), head.trim()]);
    }
  }
  for (const [field, heads] of seenAliases) {
    if (heads.length > 1) throw new OrderSourceParseError(`Columns "${heads.join('" and "')}" both mean ${field}. Keep one.`);
  }
  const knownAliases = new Set(Object.values(COLUMN_ALIASES).flat());
  const unmappedColumns = table.header
    .map((head) => head.trim())
    .filter((head) => head && !knownAliases.has(head.toLowerCase().replace(/\s+/g, "_")));
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
    const number = (key: "quantity" | "unitPrice" | "discount" | "lineTotal" | "tax", required: boolean): number | null => {
      const text = cell(row.record, key);
      if (!text) {
        if (!required) return null;
        throw new OrderSourceParseError(`Row ${row.lineNumber}: ${key === "unitPrice" ? "price" : key} is empty.`);
      }
      const parsed = strictNumber(text);
      if ("error" in parsed) throw new OrderSourceParseError(`Row ${row.lineNumber}: ${key === "unitPrice" ? "price" : key} ${parsed.error}.`);
      return parsed.value;
    };
    const quantity = number("quantity", true) as number;
    lines.push({
      sourceLineReference: cell(row.record, "lineReference") || `row-${row.lineNumber}`,
      sku: cell(row.record, "sku"),
      description: cell(row.record, "description"),
      unit: cell(row.record, "unit"),
      quantity,
      unitPrice: number("unitPrice", false),
      discountAmount: number("discount", false),
      taxAmount: number("tax", false),
      lineTotal: number("lineTotal", false),
      // What the file said, kept exactly as written.
      sourceValues: {
        sku: cell(row.record, "sku"),
        productName: cell(row.record, "description"),
        quantity: cell(row.record, "quantity") ?? undefined,
        price: cell(row.record, "unitPrice") ?? undefined,
      },
    });
  }
  if (!lines.length) throw new OrderSourceParseError("The file has no order lines.");

  for (const [key, value] of [
    ["delivery date", headerValues.deliveryDate],
    ["order date", headerValues.orderDate],
  ] as const) {
    if (value && !toIsoDateOrNull(value)) {
      throw new OrderSourceParseError(`The ${key} "${value}" is ambiguous: write it as YYYY-MM-DD (05/06/2026 could be 5 June or 6 May).`);
    }
  }

  let pricesIncludeTax: boolean | null = null;
  if (headerValues.pricesIncludeTax) {
    const stated = headerValues.pricesIncludeTax.trim().toLowerCase();
    if (YES.has(stated)) pricesIncludeTax = true;
    else if (NO.has(stated)) pricesIncludeTax = false;
    else throw new OrderSourceParseError(`"${headerValues.pricesIncludeTax}" does not say clearly whether prices include VAT. Write yes or no.`);
  }
  if (headerValues.currency && !/^[A-Za-z]{3}$/.test(headerValues.currency.trim())) {
    throw new OrderSourceParseError(`Currency "${headerValues.currency}" must be a three-letter code (for example ZAR).`);
  }

  return {
    source: input.source || "csv",
    sourceKey: cleanText(input.sourceKey, 300) || `sha256:${stableHash(text)}`,
    sourceReference: cleanText(input.fileName, 200) || "CSV upload",
    customerName: headerValues.customer ?? null,
    customerReference: headerValues.customerReference ?? input.senderEmail ?? null,
    senderEmail: input.senderEmail ?? null,
    customerPoNumber: headerValues.poNumber ?? null,
    requestedDeliveryDate: headerValues.deliveryDate ?? null,
    externalOrderNumber: headerValues.orderNumber ?? null,
    orderDate: headerValues.orderDate ?? null,
    currency: headerValues.currency ?? null,
    notes: headerValues.notes ?? null,
    pricesIncludeTax,
    extraction: unmappedColumns.length ? { method: "structured", sourceFacts: { unmappedColumns } } : { method: "structured" },
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
  "customer,customer_reference,po_number,requested_delivery_date,prices_include_vat,sku,description,quantity,unit_price,discount,vat\n" +
  "Example Customer,ACC-001,PO-1001,2026-10-01,no,SKU-001,Example product,10,25.00,0,0\n";
