import { buildHeaderIndex, parseDelimitedTable } from "@/lib/vyron-csv-parser";

export type ImportEntityType =
  | "products"
  | "finished-products"
  | "recipes"
  | "bom-lines"
  | "ingredients"
  | "packaging"
  | "suppliers"
  | "customers"
  | "categories"
  | "purchase-orders"
  | "purchase-order-lines"
  | "supplier-invoices"
  | "invoice-lines"
  | "stock-counts"
  | "opening-stock"
  | "cost-plans";

export type ImportTemplate = {
  id: ImportEntityType;
  label: string;
  description: string;
  columns: string[];
  sampleRow: string[];
};

export type ImportHistoryEntry = {
  id: string;
  entity: string;
  fileName: string;
  importedAt: string;
  validRows: number;
  rejectedRows: number;
  status: string;
};

export const importTemplates: ImportTemplate[] = [
  {
    id: "products",
    label: "Products",
    description: "Product master with selling price and target GP",
    columns: ["product_name", "category", "selling_price", "total_cost", "target_gp", "status"],
    sampleRow: ["Sample Product", "General", "32.00", "16.20", "40", "Active"],
  },
  {
    id: "finished-products",
    label: "Finished Products",
    description: "Finished products with linked recipe reference",
    columns: ["product_name", "category", "linked_recipe_name", "selling_price", "target_gp"],
    sampleRow: ["Sample Product", "General", "Sample Recipe", "32.00", "40"],
  },
  {
    id: "recipes",
    label: "Recipes / BOMs",
    description: "Recipe header records",
    columns: ["recipe_name", "recipe_type", "category", "yield_qty", "total_cost", "target_gp", "status"],
    sampleRow: ["Sample Recipe", "Finished Product", "General", "1", "16.20", "40", "Approved"],
  },
  {
    id: "bom-lines",
    label: "BOM Lines",
    description: "Recipe ingredient/packaging/labour lines",
    columns: ["recipe_name", "line_type", "ingredient_name", "quantity", "unit", "unit_cost"],
    sampleRow: ["Sample Recipe", "ingredient", "Sample Ingredient", "0.12", "kg", "95.00"],
  },
  {
    id: "ingredients",
    label: "Ingredients",
    description: "Ingredient master with yield and purchase cost",
    columns: ["ingredient_name", "category", "purchase_unit", "recipe_unit", "purchase_cost", "yield_percent"],
    sampleRow: ["Chicken Fillet", "Protein", "kg", "kg usable", "95.00", "92"],
  },
  {
    id: "packaging",
    label: "Packaging",
    description: "Packaging materials master",
    columns: ["item_name", "category", "purchase_unit", "purchase_cost", "supplier_name"],
    sampleRow: ["Pie Box 6-pack", "Packaging", "each", "4.20", "Cape Packaging"],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier master",
    columns: ["supplier_name", "category", "contact_email", "risk_status", "last_price_movement"],
    sampleRow: ["Protein Direct", "Protein", "buyer@protein.co.za", "High", "12.4"],
  },
  {
    id: "customers",
    label: "Customers",
    description: "Customer master with invoice email and terms",
    columns: ["customer_name", "category", "contact_email", "invoice_email", "phone", "terms", "vat_number", "status"],
    sampleRow: ["Acme Trading", "Retail", "buyer@acme.co.za", "accounts@acme.co.za", "021 000 0000", "30 Days", "4123456789", "Active"],
  },
  {
    id: "categories",
    label: "Categories",
    description: "Category control list",
    columns: ["category_name", "category_type", "status"],
    sampleRow: ["Pies", "Product", "Active"],
  },
  {
    id: "purchase-orders",
    label: "Purchase Orders",
    description: "PO headers",
    columns: ["po_number", "supplier_name", "status", "expected_total", "invoice_total", "order_date"],
    sampleRow: ["PO-1001", "Protein Direct", "Review", "8200.00", "9500.00", "2026-05-12"],
  },
  {
    id: "purchase-order-lines",
    label: "Purchase Order Lines",
    description: "PO line items",
    columns: ["po_number", "item_name", "quantity", "unit", "unit_cost"],
    sampleRow: ["PO-1001", "Chicken Fillet", "120", "kg", "95.00"],
  },
  {
    id: "supplier-invoices",
    label: "Supplier Invoices",
    description: "Invoice headers for document intelligence",
    columns: ["invoice_number", "supplier_name", "invoice_date", "invoice_total", "status"],
    sampleRow: ["INV-1002", "Protein Direct", "2026-05-18", "9500.00", "Review"],
  },
  {
    id: "invoice-lines",
    label: "Invoice Lines",
    description: "Extracted invoice line items",
    columns: ["invoice_number", "line_description", "quantity", "unit", "unit_cost", "line_total"],
    sampleRow: ["INV-1002", "Chicken Fillet", "120", "kg", "95.00", "11400.00"],
  },
  {
    id: "stock-counts",
    label: "Stock Counts",
    description: "Physical stock count headers",
    columns: ["count_number", "location", "status", "count_date", "notes"],
    sampleRow: ["SC-2026-06", "Main warehouse", "Open", "2026-06-01", "Monthly count"],
  },
  {
    id: "opening-stock",
    label: "Opening Stock",
    description: "Opening balances for ingredients, packaging and finished goods",
    columns: ["item_name", "entity_type", "qty_on_hand", "unit", "unit_cost", "location"],
    sampleRow: ["Chicken Fillet", "ingredient", "120", "kg", "95.00", "Main warehouse"],
  },
  {
    id: "cost-plans",
    label: "Cost Plans",
    description: "Forward cost scenarios",
    columns: ["scenario_name", "product_name", "supplier_increase_pct", "labour_increase_pct", "packaging_increase_pct", "target_gp"],
    sampleRow: ["Q3 inflation", "Chicken Pie", "6", "2", "4", "40"],
  },
];

export function templateToCsv(template: ImportTemplate) {
  const header = template.columns.join(",");
  const sample = template.sampleRow.join(",");
  return `${header}\n${sample}\n`;
}

export type ParsedImportResult = {
  validRows: Record<string, string>[];
  invalidRows: { rowNumber: number; row: Record<string, string>; errors: string[] }[];
};

/**
 * Parse an uploaded file against a template.
 *
 * Delegates all lexing to `@/lib/vyron-csv-parser` — the single parsing
 * implementation. This function owns only template mapping and validation.
 *
 * Signature and result shape are unchanged. Behaviour changes only where the
 * previous naive `split(",")` was wrong: quoted fields containing commas or
 * newlines now parse correctly, a UTF-8 BOM no longer corrupts the first header
 * name, header matching is case- and whitespace-insensitive, blank rows are
 * reported rather than silently discarded, and values that a spreadsheet would
 * evaluate as a formula are neutralised.
 */
export function parseCsvText(text: string, template: ImportTemplate): ParsedImportResult {
  const { header, rows } = parseDelimitedTable(text);

  if (!header.length || !rows.some((row) => !row.isBlank)) {
    return {
      validRows: [],
      invalidRows: [{ rowNumber: 1, row: {}, errors: ["File must include header and at least one data row"] }],
    };
  }

  const headerIndex = buildHeaderIndex(header);
  const missing = template.columns.filter((col) => !headerIndex.has(col.trim().toLowerCase()));
  if (missing.length) {
    return {
      validRows: [],
      invalidRows: [{ rowNumber: 1, row: {}, errors: [`Missing columns: ${missing.join(", ")}`] }],
    };
  }

  const validRows: Record<string, string>[] = [];
  const invalidRows: ParsedImportResult["invalidRows"] = [];

  for (const { record, lineNumber, isBlank } of rows) {
    if (isBlank) {
      invalidRows.push({ rowNumber: lineNumber, row: {}, errors: ["Row is empty"] });
      continue;
    }

    const row: Record<string, string> = {};
    for (const col of template.columns) {
      const position = headerIndex.get(col.trim().toLowerCase());
      row[col] = position === undefined ? "" : record[position] ?? "";
    }

    const errors: string[] = [];
    if (!row[template.columns[0]]) errors.push(`${template.columns[0]} is required`);
    for (const col of template.columns) {
      if (/price|cost|total|qty|percent|movement|gp/i.test(col) && row[col] && Number.isNaN(Number(row[col]))) {
        errors.push(`${col} must be numeric`);
      }
    }

    if (errors.length) invalidRows.push({ rowNumber: lineNumber, row, errors });
    else validRows.push(row);
  }

  return { validRows, invalidRows };
}

export function defaultImportHistory(): ImportHistoryEntry[] {
  return [
    {
      id: "hist-1",
      entity: "Ingredients",
      fileName: "handcrafted-ingredients.csv",
      importedAt: "2026-05-20 09:14",
      validRows: 186,
      rejectedRows: 2,
      status: "Completed",
    },
    {
      id: "hist-2",
      entity: "Products",
      fileName: "pie-range-products.csv",
      importedAt: "2026-05-21 11:02",
      validRows: 42,
      rejectedRows: 0,
      status: "Completed",
    },
  ];
}
