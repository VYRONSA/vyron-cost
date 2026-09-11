/**
 * Food Sock Meals — the supplied source files, read exactly.
 *
 * Every record carries its provenance (file, sha256, sheet, row). Nothing here
 * decides identity or writes anything; it only turns the client's exports into
 * typed records without losing a character:
 *
 *  - CSVs go through the migration CSV reader (byte-order mark stripped, quoted
 *    fields honoured, strict UTF-8), not a spreadsheet library.
 *  - Workbook cells are read as raw values. Integers are rendered exactly, so a
 *    12-digit SKU or a 13-digit GTIN is never shown as 7.45853E+11.
 *  - Numeric cells are classified (number / TBC / blank / invalid), never
 *    coerced to zero.
 *
 * File bytes are injected, so the reader has no file-system dependency and can
 * be exercised with synthetic fixtures.
 */
import * as XLSX from "xlsx";
import { parseCsv, decodeCsvBytes, readCsvTable } from "@/lib/data-migration/csv";
import {
  normalizeName,
  parseSourceBoolean,
  parseSourceNumber,
  sha256OfBuffer,
  type SourceNumber,
  type SourceRef,
} from "@/lib/data-migration/core";

export const FOOD_SOCK_SOURCE_FILES = {
  setup: "Food Stock Meals - Demo Setup Information.xlsx",
  productRange: "Product Range.xlsx",
  vendors: "inFlow_Vendor.csv",
  products: "inFlow_ProductDetails (1).csv",
  images: "inFlow_ProductImages.csv",
  purchaseOrders: "inFlow_PurchaseOrder.csv",
  stockLevels: "inFlow_StockLevels.csv",
  barcodes: "Barcodes - GM.xlsx",
  bom: "inFlow_BOM (1).csv",
  bomReference: "Food Sock SKU BOM Reference (1).xlsx",
  contacts: "Contacts (1).csv",
} as const;

export type FoodSockFileKey = keyof typeof FOOD_SOCK_SOURCE_FILES;

export type SourceFileInfo = {
  key: FoodSockFileKey;
  name: string;
  sha256: string;
  bytes: number;
  encoding?: string;
  hadByteOrderMark?: boolean;
  /** Data rows whose cell count differs from the header. */
  malformedRows?: number;
  headerWidth?: number;
  rowWidths?: Record<string, number>;
};

/* ------------------------------------------------------------------ records */

export type VendorRecord = {
  ref: SourceRef;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  paymentTerms: string;
  currency: string;
  taxInclusivePricing: boolean | null;
  isActive: boolean | null;
  remarks: string;
};

export type ProductRecord = {
  ref: SourceRef;
  name: string;
  sku: string;
  category: string;
  itemType: string;
  description: string;
  uom: string;
  purchasingUom: string;
  purchasingRatio: SourceNumber;
  cost: SourceNumber;
  defaultPrice: SourceNumber;
  taxInclusivePrice: boolean | null;
  lastVendor: string;
  barcode: string;
  isActive: boolean | null;
  autoManufacture: boolean | null;
  weight: SourceNumber;
  remarks: string;
};

export type BomLineRecord = {
  ref: SourceRef;
  finishedName: string;
  finishedSku: string;
  componentName: string;
  componentSku: string;
  quantity: SourceNumber;
  uom: string;
  isActive: boolean | null;
};

export type StockLevelRecord = { ref: SourceRef; name: string; sku: string; location: string; quantity: SourceNumber };

export type PurchaseOrderLineRecord = {
  ref: SourceRef;
  orderNumber: string;
  inventoryStatus: string;
  paymentStatus: string;
  vendor: string;
  orderDate: string;
  dueDate: string;
  isCancelled: boolean | null;
  isQuote: boolean | null;
  productName: string;
  sku: string;
  quantity: SourceNumber;
  uom: string;
  unitPrice: SourceNumber;
  taxName: string;
  taxRate: SourceNumber;
};

export type ImageRecord = { ref: SourceRef; name: string; sku: string; url: string };

export type BarcodeRecord = {
  ref: SourceRef;
  productType: string;
  gtin: string;
  /** Why the GTIN cannot be trusted as written, if it cannot. */
  gtinIssue: string | null;
  brand: string;
  functionalName: string;
  variant: string;
  netContent: SourceNumber;
  uom: string;
};

export type CostReferenceRecord = {
  ref: SourceRef;
  category: string;
  component: string;
  costFactor: SourceNumber;
  sourceCostPerKg: SourceNumber;
  supplier: string;
  notes: string;
};

/** One cell of the workbook's "BOM COST BY PRODUCT FORMAT" index. */
export type WorkbookBomCostRecord = { ref: SourceRef; flavour: string; format: string; cost: SourceNumber };

export type ProductRangeRecord = { ref: SourceRef; category: string; product: string; sku: string; totalSold: SourceNumber; totalRevenue: SourceNumber };

export type ContactNameRecord = { ref: SourceRef; name: string };

export type FoodSockSources = {
  files: SourceFileInfo[];
  vendors: VendorRecord[];
  products: ProductRecord[];
  bomLines: BomLineRecord[];
  stockLevels: StockLevelRecord[];
  purchaseOrderLines: PurchaseOrderLineRecord[];
  images: ImageRecord[];
  barcodes: BarcodeRecord[];
  costReference: CostReferenceRecord[];
  workbookBomCosts: WorkbookBomCostRecord[];
  productRange: ProductRangeRecord[];
  /** Contact names only. The export's column layout is broken (see files), so nothing else is taken. */
  contacts: ContactNameRecord[];
  /** Product names the client listed as discontinued (questionnaire item 03.26). */
  discontinuedNames: { ref: SourceRef; name: string }[];
};

/* ------------------------------------------------------------------ helpers */

export type ReadSourceFile = (fileName: string) => Uint8Array;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return Number.isSafeInteger(value) ? String(value) : `UNSAFE_INTEGER:${value}`;
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type SheetRow = { row: number; cells: string[] };

function readSheet(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
  const start = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r : 0;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  return matrix.map((cells, index) => ({ row: start + index + 1, cells: (cells || []).map(cellText) }));
}

/** GS1 mod-10 check digit over GTIN-8/12/13/14. */
export function gtinIssue(gtin: string): string | null {
  if (!/^\d+$/.test(gtin)) return "GTIN contains non-digit characters.";
  if (![8, 12, 13, 14].includes(gtin.length)) return `GTIN has ${gtin.length} digits; GS1 GTINs have 8, 12, 13 or 14.`;
  const digits = gtin.split("").map(Number);
  const check = digits.pop() as number;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  const expected = (10 - (sum % 10)) % 10;
  return expected === check ? null : `GTIN check digit is ${check}; GS1 requires ${expected}.`;
}

/* ------------------------------------------------------------------- reader */

export function readFoodSockSources(readFile: ReadSourceFile): FoodSockSources {
  const files: SourceFileInfo[] = [];
  const bytesOf = {} as Record<FoodSockFileKey, Uint8Array>;
  for (const key of Object.keys(FOOD_SOCK_SOURCE_FILES) as FoodSockFileKey[]) {
    const name = FOOD_SOCK_SOURCE_FILES[key];
    const bytes = readFile(name);
    bytesOf[key] = bytes;
    files.push({ key, name, sha256: sha256OfBuffer(bytes), bytes: bytes.length });
  }
  const info = (key: FoodSockFileKey) => files.find((file) => file.key === key) as SourceFileInfo;
  const refOf = (key: FoodSockFileKey, row: number, system: string, sheet?: string): SourceRef => ({
    system,
    file: FOOD_SOCK_SOURCE_FILES[key],
    fileSha256: info(key).sha256,
    ...(sheet ? { sheet } : {}),
    row,
  });

  const csv = (key: FoodSockFileKey) => {
    const table = readCsvTable(bytesOf[key]);
    Object.assign(info(key), {
      encoding: table.encoding,
      hadByteOrderMark: table.hadByteOrderMark,
      malformedRows: table.malformedRows.length,
      headerWidth: table.header.length,
    });
    return table.records;
  };

  const vendors: VendorRecord[] = csv("vendors").map(({ row, values: v }) => ({
    ref: refOf("vendors", row, "inflow"),
    name: v.Name ?? "",
    contactName: v.ContactName ?? "",
    email: v.Email ?? "",
    phone: v.Phone ?? "",
    paymentTerms: v.PaymentTerms ?? "",
    currency: v.CurrencyCode ?? "",
    taxInclusivePricing: parseSourceBoolean(v.IsTaxInclusivePricing),
    isActive: parseSourceBoolean(v.IsActive),
    remarks: v.Remarks ?? "",
  }));

  const products: ProductRecord[] = csv("products").map(({ row, values: v }) => ({
    ref: refOf("products", row, "inflow"),
    name: v.ProductName ?? "",
    sku: v.SKU ?? "",
    category: v.Category ?? "",
    itemType: v.ItemType ?? "",
    description: v.Description ?? "",
    uom: v.Uom ?? "",
    purchasingUom: v.PurchasingUom ?? "",
    purchasingRatio: parseSourceNumber(v.PurchasingUomRatio2),
    cost: parseSourceNumber(v.Cost),
    defaultPrice: parseSourceNumber(v.DefaultUnitPrice),
    taxInclusivePrice: parseSourceBoolean(v.IsTaxInclusivePrice),
    lastVendor: v.LastVendor ?? "",
    barcode: v.BarCode ?? "",
    isActive: parseSourceBoolean(v.IsActive),
    autoManufacture: parseSourceBoolean(v.AutoManufacture),
    weight: parseSourceNumber(v.ProductWeight),
    remarks: v.Remarks ?? "",
  }));

  const bomLines: BomLineRecord[] = csv("bom").map(({ row, values: v }) => ({
    ref: refOf("bom", row, "inflow"),
    finishedName: v.FinishedProduct ?? "",
    finishedSku: v.FinishedProductSKU ?? "",
    componentName: v.ComponentProduct ?? "",
    componentSku: v.ComponentProductSKU ?? "",
    quantity: parseSourceNumber(v.Quantity),
    uom: v.QuantityUom ?? "",
    isActive: parseSourceBoolean(v.IsActive),
  }));

  const stockLevels: StockLevelRecord[] = csv("stockLevels").map(({ row, values: v }) => ({
    ref: refOf("stockLevels", row, "inflow"),
    name: v.ProductName ?? "",
    sku: v.SKU ?? "",
    location: v.Location ?? "",
    quantity: parseSourceNumber(v.Quantity),
  }));

  const purchaseOrderLines: PurchaseOrderLineRecord[] = csv("purchaseOrders").map(({ row, values: v }) => ({
    ref: refOf("purchaseOrders", row, "inflow"),
    orderNumber: v.OrderNumber ?? "",
    inventoryStatus: v.InventoryStatus ?? "",
    paymentStatus: v.PaymentStatus ?? "",
    vendor: v.Vendor ?? "",
    orderDate: v.OrderDate ?? "",
    dueDate: v.DueDate ?? "",
    isCancelled: parseSourceBoolean(v.IsCancelled),
    isQuote: parseSourceBoolean(v.IsQuote),
    productName: v.ProductName ?? "",
    sku: v.ProductSKU ?? "",
    quantity: parseSourceNumber(v.ProductQuantity),
    uom: v.ProductQuantityUoM ?? "",
    unitPrice: parseSourceNumber(v.ProductUnitPrice),
    taxName: v.Tax1Name ?? "",
    taxRate: parseSourceNumber(v.Tax1Rate),
  }));

  const images: ImageRecord[] = csv("images").map(({ row, values: v }) => ({
    ref: refOf("images", row, "inflow"),
    name: v.ProductName ?? "",
    sku: v.Sku ?? "",
    url: v.ImageUrl ?? "",
  }));

  /* Contacts: the header has 73 columns but data rows carry 53 or 57 cells, so
     positional mapping beyond the first column cannot be trusted. Only the
     contact name (column 1) is taken; the structure is reported. */
  const contactRows = parseCsv(decodeCsvBytes(bytesOf.contacts).text);
  const contactHeader = contactRows[0] || [];
  const rowWidths: Record<string, number> = {};
  const contacts: ContactNameRecord[] = [];
  contactRows.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === "")) return;
    rowWidths[String(cells.length)] = (rowWidths[String(cells.length)] || 0) + 1;
    contacts.push({ ref: refOf("contacts", index + 2, "xero"), name: cells[0] ?? "" });
  });
  Object.assign(info("contacts"), {
    headerWidth: contactHeader.length,
    rowWidths,
    malformedRows: Object.entries(rowWidths).filter(([width]) => Number(width) !== contactHeader.length).reduce((total, [, n]) => total + n, 0),
  });

  /* GS1 barcode sheet: row 1 is guidance text, row 2 the header, data after. */
  const barcodeBook = XLSX.read(bytesOf.barcodes, { type: "array" });
  const barcodeRows = readSheet(barcodeBook, barcodeBook.SheetNames[0]);
  const barcodes: BarcodeRecord[] = barcodeRows
    .filter((r) => r.row >= 3 && r.cells.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const gtin = (r.cells[1] || "").trim();
      return {
        ref: refOf("barcodes", r.row, "gs1", barcodeBook.SheetNames[0]),
        productType: r.cells[0] || "",
        gtin,
        gtinIssue: gtin ? gtinIssue(gtin) : "GTIN is blank.",
        brand: (r.cells[2] || "").trim(),
        functionalName: (r.cells[4] || "").trim(),
        variant: (r.cells[5] || "").trim(),
        netContent: parseSourceNumber(r.cells[6]),
        uom: (r.cells[7] || "").trim(),
      };
    });

  /* Costing workbook: Cost Reference sheet and the BOM cost index. */
  const referenceBook = XLSX.read(bytesOf.bomReference, { type: "array" });
  const costReference: CostReferenceRecord[] = readSheet(referenceBook, "Cost Reference")
    .filter((r) => r.row >= 2 && r.cells.some((cell) => cell.trim() !== ""))
    .map((r) => ({
      ref: refOf("bomReference", r.row, "workbook", "Cost Reference"),
      category: (r.cells[0] || "").trim(),
      component: (r.cells[1] || "").trim(),
      costFactor: parseSourceNumber(r.cells[2]),
      sourceCostPerKg: parseSourceNumber(r.cells[3]),
      supplier: (r.cells[4] || "").trim(),
      notes: (r.cells[5] || "").trim(),
    }));

  const indexRows = readSheet(referenceBook, "Index");
  const indexHeader = indexRows.find((r) => normalizeName(r.cells[1]) === "flavour / product");
  const workbookBomCosts: WorkbookBomCostRecord[] = [];
  if (indexHeader) {
    for (const r of indexRows.filter((x) => x.row > indexHeader.row && /^\d+$/.test((x.cells[0] || "").trim()))) {
      for (let column = 4; column < indexHeader.cells.length; column += 1) {
        const format = (indexHeader.cells[column] || "").trim();
        if (!format) continue;
        const cost = parseSourceNumber(r.cells[column]);
        if (cost.kind === "blank" || (cost.kind === "invalid" && /^[–-]$/.test(cost.raw))) continue;
        workbookBomCosts.push({ ref: refOf("bomReference", r.row, "workbook", "Index"), flavour: (r.cells[1] || "").trim(), format, cost });
      }
    }
  }

  /* Product Range sheet: the product list with SKU and historical sales (columns K..U). */
  const rangeBook = XLSX.read(bytesOf.productRange, { type: "array" });
  const rangeRows = readSheet(rangeBook, "Product Range");
  const productRange: ProductRangeRecord[] = rangeRows
    .filter((r) => r.row >= 2 && (r.cells[11] || "").trim() !== "")
    .map((r) => ({
      ref: refOf("productRange", r.row, "workbook", "Product Range"),
      category: (r.cells[10] || "").trim(),
      product: (r.cells[11] || "").trim(),
      sku: (r.cells[12] || "").trim(),
      totalSold: parseSourceNumber(r.cells[13]),
      totalRevenue: parseSourceNumber(r.cells[14]),
    }));

  /* Questionnaire 03.26: products the client says are discontinued. */
  const setupBook = XLSX.read(bytesOf.setup, { type: "array" });
  const discontinuedNames: { ref: SourceRef; name: string }[] = [];
  const rangeSheet = setupBook.SheetNames.find((name) => name.startsWith("03"));
  if (rangeSheet) {
    const answer = readSheet(setupBook, rangeSheet).find((r) => (r.cells[0] || "").trim() === "03.26");
    if (answer) {
      for (const name of (answer.cells[3] || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
        discontinuedNames.push({ ref: refOf("setup", answer.row, "workbook", rangeSheet), name });
      }
    }
  }

  return {
    files,
    vendors,
    products,
    bomLines,
    stockLevels,
    purchaseOrderLines,
    images,
    barcodes,
    costReference,
    workbookBomCosts,
    productRange,
    contacts,
    discontinuedNames,
  };
}
