import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { listStockBackedFinishedGoodsForInvoice } from "@/lib/vyron-inventory";
import { buildCsvBuffer, buildExcelBuffer, buildPdfBuffer, type ExportColumn, type ExportFilter, type ExportRow } from "@/lib/vyron-export-centre";

export type FinishedGoodsExportRow = {
  finishedGoodCode: string;
  finishedGoodName: string;
  category: string;
  unitOfMeasure: string;
  standardCost: number;
  currentCost: number;
  sellingPrice: number;
  grossProfit: number;
  grossProfitPercent: number;
  recipeBomVersion: string;
  status: "Active" | "Inactive";
  createdDate: Date | null;
  lastUpdated: Date | null;
  stockOnHand: number;
  inventoryValue: number;
};

export type FinishedGoodsExportFilters = {
  scope: "stock_only" | "all" | "selected";
  selectedIds: string[];
  includeZeroBalance: boolean;
  dateCreatedFrom: string;
  dateCreatedTo: string;
  dateUpdatedFrom: string;
  dateUpdatedTo: string;
  createdBy: string;
  supplier: string;
  productGroup: string;
  includeFlags: Record<string, boolean>;
  inventoryFieldFlags: Record<string, boolean>;
  manufacturingFieldFlags: Record<string, boolean>;
  commercialFieldFlags: Record<string, boolean>;
  search: string;
  category: string;
  status: "" | "active" | "inactive";
  sortBy:
    | "name"
    | "code"
    | "category"
    | "status"
    | "standard_cost"
    | "current_cost"
    | "selling_price"
    | "gross_profit"
    | "gross_profit_percent"
    | "updated_at";
  sortDirection: "asc" | "desc";
};

export function parseFinishedGoodsExportFilters(searchParams: URLSearchParams): FinishedGoodsExportFilters {
  const scopeRaw = String(searchParams.get("scope") || "stock_only").toLowerCase();
  const scope: FinishedGoodsExportFilters["scope"] =
    scopeRaw === "all" ? "all" : scopeRaw === "selected" ? "selected" : "stock_only";

  const includeZeroRaw = String(searchParams.get("includeZeroBalance") || "").toLowerCase();
  const includeZeroBalance =
    scope === "all"
      ? includeZeroRaw === ""
        ? true
        : !(includeZeroRaw === "false" || includeZeroRaw === "0" || includeZeroRaw === "no" || includeZeroRaw === "off")
      : false;

  const selectedIds = String(searchParams.get("selectedIds") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const includeFlags = JSON.parse(String(searchParams.get("includeFlags") || "{}")) as Record<string, boolean>;
  const inventoryFieldFlags = JSON.parse(String(searchParams.get("inventoryFieldFlags") || "{}")) as Record<string, boolean>;
  const manufacturingFieldFlags = JSON.parse(String(searchParams.get("manufacturingFieldFlags") || "{}")) as Record<string, boolean>;
  const commercialFieldFlags = JSON.parse(String(searchParams.get("commercialFieldFlags") || "{}")) as Record<string, boolean>;

  const statusRaw = String(searchParams.get("status") || "").toLowerCase();
  const sortByRaw = String(searchParams.get("sortBy") || "name").toLowerCase();
  const sortDirectionRaw = String(searchParams.get("sortDirection") || "asc").toLowerCase();

  const status: FinishedGoodsExportFilters["status"] =
    statusRaw === "active" || statusRaw === "inactive" ? statusRaw : "";

  const sortBy: FinishedGoodsExportFilters["sortBy"] =
    sortByRaw === "code" ||
    sortByRaw === "category" ||
    sortByRaw === "status" ||
    sortByRaw === "standard_cost" ||
    sortByRaw === "current_cost" ||
    sortByRaw === "selling_price" ||
    sortByRaw === "gross_profit" ||
    sortByRaw === "gross_profit_percent" ||
    sortByRaw === "updated_at"
      ? sortByRaw
      : "name";

  const sortDirection: FinishedGoodsExportFilters["sortDirection"] =
    sortDirectionRaw === "desc" ? "desc" : "asc";

  return {
    scope,
    selectedIds,
    includeZeroBalance,
    dateCreatedFrom: String(searchParams.get("dateCreatedFrom") || ""),
    dateCreatedTo: String(searchParams.get("dateCreatedTo") || ""),
    dateUpdatedFrom: String(searchParams.get("dateUpdatedFrom") || ""),
    dateUpdatedTo: String(searchParams.get("dateUpdatedTo") || ""),
    createdBy: String(searchParams.get("createdBy") || "").trim().toLowerCase(),
    supplier: String(searchParams.get("supplier") || "").trim().toLowerCase(),
    productGroup: String(searchParams.get("productGroup") || "").trim().toLowerCase(),
    includeFlags,
    inventoryFieldFlags,
    manufacturingFieldFlags,
    commercialFieldFlags,
    search: String(searchParams.get("search") || "").trim().toLowerCase(),
    category: String(searchParams.get("category") || "").trim().toLowerCase(),
    status,
    sortBy,
    sortDirection,
  };
}

async function listAllProductsForExport(supabase: SupabaseClient, companyId: string) {
  const all: Array<Record<string, unknown>> = [];
  const pageSize = 1000;

  for (let page = 0; ; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("vyron_cost_products")
      .select("id,product_name,sku,product_category,category,total_cost,selling_price,product_status,status,linked_bom_id,created_at,updated_at")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);

    const rows = (data || []) as Array<Record<string, unknown>>;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  return all;
}

async function listStockByProductId(supabase: SupabaseClient, companyId: string, productIds: string[]) {
  const stockByProductId = new Map<string, Record<string, unknown>>();
  if (!productIds.length) return stockByProductId;

  const chunkSize = 500;
  for (let index = 0; index < productIds.length; index += chunkSize) {
    const chunk = productIds.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("vyron_cost_stock_items")
      .select("entity_id,item_code,unit,average_cost,qty_on_hand,inventory_value,updated_at")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .in("entity_id", chunk);
    if (error) throw new Error(error.message);

    for (const row of data || []) {
      const key = String((row as { entity_id?: string }).entity_id || "");
      if (key) stockByProductId.set(key, row as Record<string, unknown>);
    }
  }

  return stockByProductId;
}

async function listBomNamesById(supabase: SupabaseClient, companyId: string, bomIds: string[]) {
  const bomNameById = new Map<string, string>();
  if (!bomIds.length) return bomNameById;

  const chunkSize = 500;
  for (let index = 0; index < bomIds.length; index += chunkSize) {
    const chunk = bomIds.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("vyron_cost_boms")
      .select("id,bom_name")
      .eq("company_id", companyId)
      .in("id", chunk);
    if (error) throw new Error(error.message);

    for (const row of data || []) {
      bomNameById.set(String((row as { id?: string }).id || ""), String((row as { bom_name?: string }).bom_name || ""));
    }
  }

  return bomNameById;
}

async function listAllFinishedGoodsExportRows(supabase: SupabaseClient, companyId: string) {
  const products = await listAllProductsForExport(supabase, companyId);
  if (!products.length) return [];

  const productIds = products.map((product) => String(product.id || "")).filter(Boolean);
  const linkedBomIds = Array.from(
    new Set(
      products
        .map((product) => String(product.linked_bom_id || "").trim())
        .filter(Boolean)
    )
  );

  const [stockByProductId, bomNameById] = await Promise.all([
    listStockByProductId(supabase, companyId, productIds),
    listBomNamesById(supabase, companyId, linkedBomIds),
  ]);

  return products.map((product) => {
    const productId = String(product.id || "");
    const stock = stockByProductId.get(productId);
    const standardCost = Number(product.total_cost || 0);
    const currentCost = Number(stock?.average_cost || standardCost || 0);
    const sellingPrice = Number(product.selling_price || 0);
    const grossProfit = sellingPrice - currentCost;
    const grossProfitPercent = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;

    return {
      finishedGoodCode: String(product.sku || ""),
      finishedGoodName: String(product.product_name || ""),
      category: String(product.product_category || product.category || ""),
      unitOfMeasure: String(stock?.unit || "unit"),
      standardCost,
      currentCost,
      sellingPrice,
      grossProfit,
      grossProfitPercent,
      recipeBomVersion: bomNameById.get(String(product.linked_bom_id || "")) || "",
      status: toActivityStatus((product.product_status || product.status) as string | null | undefined),
      createdDate: parseDate(product.created_at as string | null | undefined),
      lastUpdated: parseDate((stock?.updated_at as string | null | undefined) || (product.updated_at as string | null | undefined)),
      stockOnHand: Number(stock?.qty_on_hand || 0),
      inventoryValue: Number(stock?.inventory_value || 0),
    } satisfies FinishedGoodsExportRow;
  });
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatIsoDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toActivityStatus(value: string | null | undefined): "Active" | "Inactive" {
  const next = String(value || "active").toLowerCase();
  if (next === "inactive" || next === "archived" || next === "disabled") return "Inactive";
  return "Active";
}

export async function listFinishedGoodsExportRows(
  supabase: SupabaseClient,
  companyId: string,
  filters: FinishedGoodsExportFilters
): Promise<FinishedGoodsExportRow[]> {
  const rows =
    filters.scope === "all"
      ? await listAllFinishedGoodsExportRows(supabase, companyId)
      : (await listStockBackedFinishedGoodsForInvoice(supabase, companyId)).map((row) => {
          const standardCost = Number(row.standardCost || 0);
          const currentCost = Number(row.unitCost || standardCost || 0);
          const sellingPrice = Number(row.sellingPrice || 0);
          const grossProfit = sellingPrice - currentCost;
          const grossProfitPercent = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;

          return {
            finishedGoodCode: String(row.sku || ""),
            finishedGoodName: String(row.productName || ""),
            category: String(row.category || ""),
            unitOfMeasure: String(row.unitOfMeasure || "unit"),
            standardCost,
            currentCost,
            sellingPrice,
            grossProfit,
            grossProfitPercent,
            recipeBomVersion: String(row.linkedBomName || ""),
            status: toActivityStatus(row.activityStatus),
            createdDate: parseDate(row.createdAt),
            lastUpdated: parseDate(row.updatedAt),
            stockOnHand: Number(row.stockOnHand || 0),
            inventoryValue: Number(row.inventoryValue || 0),
          } satisfies FinishedGoodsExportRow;
        });

  const filtered = rows.filter((row) => {
    if (filters.scope === "selected" && filters.selectedIds.length) {
      const selected = new Set(filters.selectedIds);
      const rowId = String((row as unknown as { productId?: string }).productId || "");
      if (!selected.has(rowId)) return false;
    }

    if (filters.scope === "all" && !filters.includeZeroBalance && row.stockOnHand === 0) {
      return false;
    }

    if (filters.search) {
      const haystack = [row.finishedGoodCode, row.finishedGoodName, row.category].join(" ").toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }

    if (filters.category && row.category.toLowerCase() !== filters.category) {
      return false;
    }

    if (filters.status && row.status.toLowerCase() !== filters.status) {
      return false;
    }

    if (filters.dateCreatedFrom && row.createdDate) {
      const from = new Date(`${filters.dateCreatedFrom}T00:00:00Z`).getTime();
      if (row.createdDate.getTime() < from) return false;
    }
    if (filters.dateCreatedTo && row.createdDate) {
      const to = new Date(`${filters.dateCreatedTo}T23:59:59Z`).getTime();
      if (row.createdDate.getTime() > to) return false;
    }

    if (filters.dateUpdatedFrom && row.lastUpdated) {
      const from = new Date(`${filters.dateUpdatedFrom}T00:00:00Z`).getTime();
      if (row.lastUpdated.getTime() < from) return false;
    }
    if (filters.dateUpdatedTo && row.lastUpdated) {
      const to = new Date(`${filters.dateUpdatedTo}T23:59:59Z`).getTime();
      if (row.lastUpdated.getTime() > to) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const direction = filters.sortDirection === "desc" ? -1 : 1;

    if (filters.sortBy === "code") return a.finishedGoodCode.localeCompare(b.finishedGoodCode) * direction;
    if (filters.sortBy === "category") return a.category.localeCompare(b.category) * direction;
    if (filters.sortBy === "status") return a.status.localeCompare(b.status) * direction;
    if (filters.sortBy === "standard_cost") return (a.standardCost - b.standardCost) * direction;
    if (filters.sortBy === "current_cost") return (a.currentCost - b.currentCost) * direction;
    if (filters.sortBy === "selling_price") return (a.sellingPrice - b.sellingPrice) * direction;
    if (filters.sortBy === "gross_profit") return (a.grossProfit - b.grossProfit) * direction;
    if (filters.sortBy === "gross_profit_percent") return (a.grossProfitPercent - b.grossProfitPercent) * direction;
    if (filters.sortBy === "updated_at") {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return (aTime - bTime) * direction;
    }

    return a.finishedGoodName.localeCompare(b.finishedGoodName) * direction;
  });

  return filtered;
}

export function toFinishedGoodsCsv(rows: FinishedGoodsExportRow[]) {
  const header = [
    "Finished Good Code",
    "Finished Good Name",
    "Category",
    "Unit of Measure",
    "Standard Cost",
    "Current Cost",
    "Selling Price",
    "Gross Profit",
    "Gross Profit %",
    "Recipe/BOM Version",
    "Status",
    "Created Date",
    "Last Updated",
    "Stock On Hand",
    "Inventory Value",
  ];

  const csvRows = rows.map((row) => [
    escapeCsvCell(row.finishedGoodCode),
    escapeCsvCell(row.finishedGoodName),
    escapeCsvCell(row.category),
    escapeCsvCell(row.unitOfMeasure),
    row.standardCost.toFixed(2),
    row.currentCost.toFixed(2),
    row.sellingPrice.toFixed(2),
    row.grossProfit.toFixed(2),
    row.grossProfitPercent.toFixed(2),
    escapeCsvCell(row.recipeBomVersion),
    escapeCsvCell(row.status),
    escapeCsvCell(row.createdDate ? formatIsoDate(row.createdDate.toISOString()) : ""),
    escapeCsvCell(row.lastUpdated ? formatIsoDate(row.lastUpdated.toISOString()) : ""),
    row.stockOnHand.toFixed(4),
    row.inventoryValue.toFixed(2),
  ]);

  return [header.map(escapeCsvCell).join(","), ...csvRows.map((row) => row.join(","))].join("\n");
}

export function toFinishedGoodsFiltersList(filters: FinishedGoodsExportFilters): ExportFilter[] {
  const map: Array<[string, string]> = [
    ["Scope", filters.scope],
    ["Include Zero Balance", String(filters.includeZeroBalance)],
    ["Search", filters.search],
    ["Category", filters.category],
    ["Status", filters.status],
    ["Date Created From", filters.dateCreatedFrom],
    ["Date Created To", filters.dateCreatedTo],
    ["Date Updated From", filters.dateUpdatedFrom],
    ["Date Updated To", filters.dateUpdatedTo],
    ["Created By", filters.createdBy],
    ["Supplier", filters.supplier],
    ["Product Group", filters.productGroup],
    ["Sort By", filters.sortBy],
    ["Sort Direction", filters.sortDirection],
  ];
  return map
    .filter((entry) => Boolean(entry[1]))
    .map(([label, value], index) => ({ key: `f-${index}`, label, value }));
}

export function toFinishedGoodsExportColumns(filters: FinishedGoodsExportFilters): ExportColumn[] {
  const columns: ExportColumn[] = [
    { key: "finishedGoodCode", label: "Finished Good Code", type: "text" },
    { key: "finishedGoodName", label: "Finished Good Name", type: "text" },
  ];

  if (filters.commercialFieldFlags.category !== false) columns.push({ key: "category", label: "Category", type: "text" });
  if (filters.inventoryFieldFlags.standardCost !== false) columns.push({ key: "standardCost", label: "Standard Cost", type: "currency" });
  if (filters.inventoryFieldFlags.currentCost !== false) columns.push({ key: "currentCost", label: "Current Cost", type: "currency" });
  if (filters.commercialFieldFlags.sellingPrice !== false) columns.push({ key: "sellingPrice", label: "Selling Price", type: "currency" });
  if (filters.commercialFieldFlags.grossProfit !== false) columns.push({ key: "grossProfit", label: "Gross Profit", type: "currency" });
  if (filters.commercialFieldFlags.grossProfitPercent !== false) columns.push({ key: "grossProfitPercent", label: "Gross Profit %", type: "percent" });
  if (filters.manufacturingFieldFlags.recipeVersion !== false) columns.push({ key: "recipeBomVersion", label: "Recipe Version", type: "text" });
  columns.push({ key: "status", label: "Status", type: "text" });
  columns.push({ key: "createdDate", label: "Created Date", type: "date" });
  columns.push({ key: "lastUpdated", label: "Updated Date", type: "date" });
  if (filters.inventoryFieldFlags.stockOnHand !== false) columns.push({ key: "stockOnHand", label: "Stock On Hand", type: "number" });
  if (filters.inventoryFieldFlags.inventoryValue !== false) columns.push({ key: "inventoryValue", label: "Inventory Value", type: "currency" });

  return columns;
}

export function toFinishedGoodsExportRows(rows: FinishedGoodsExportRow[]): ExportRow[] {
  return rows.map((row) => ({
    finishedGoodCode: row.finishedGoodCode,
    finishedGoodName: row.finishedGoodName,
    category: row.category,
    standardCost: row.standardCost,
    currentCost: row.currentCost,
    sellingPrice: row.sellingPrice,
    grossProfit: row.grossProfit,
    grossProfitPercent: row.grossProfitPercent / 100,
    recipeBomVersion: row.recipeBomVersion,
    status: row.status,
    createdDate: row.createdDate ? row.createdDate.toISOString() : null,
    lastUpdated: row.lastUpdated ? row.lastUpdated.toISOString() : null,
    stockOnHand: row.stockOnHand,
    inventoryValue: row.inventoryValue,
  }));
}

export async function toFinishedGoodsXlsxWithCentre(
  rows: FinishedGoodsExportRow[],
  options: {
    companyName: string;
    tradingName: string | null;
    logoUrl: string | null;
    logoDataUrl?: string | null;
    userName: string;
    generatedAtIso: string;
    filters: FinishedGoodsExportFilters;
  }
) {
  const columns = toFinishedGoodsExportColumns(options.filters);
  const exportRows = toFinishedGoodsExportRows(rows);
  return buildExcelBuffer({
    title: "Finished Goods Export",
    generatedAtIso: options.generatedAtIso,
    branding: {
      companyName: options.companyName,
      tradingName: options.tradingName,
      logoUrl: options.logoUrl,
      logoDataUrl: options.logoDataUrl || null,
    },
    userName: options.userName,
    filters: toFinishedGoodsFiltersList(options.filters),
    columns,
    rows: exportRows,
  });
}

export function toFinishedGoodsCsvWithCentre(
  rows: FinishedGoodsExportRow[],
  options: {
    companyName: string;
    tradingName: string | null;
    logoUrl: string | null;
    logoDataUrl?: string | null;
    userName: string;
    generatedAtIso: string;
    filters: FinishedGoodsExportFilters;
  }
) {
  const columns = toFinishedGoodsExportColumns(options.filters);
  const exportRows = toFinishedGoodsExportRows(rows);
  return buildCsvBuffer({
    title: "Finished Goods Export",
    generatedAtIso: options.generatedAtIso,
    branding: {
      companyName: options.companyName,
      tradingName: options.tradingName,
      logoUrl: options.logoUrl,
      logoDataUrl: options.logoDataUrl || null,
    },
    userName: options.userName,
    filters: toFinishedGoodsFiltersList(options.filters),
    columns,
    rows: exportRows,
  });
}

export function toFinishedGoodsPdf(
  rows: FinishedGoodsExportRow[],
  options: {
    companyName: string;
    tradingName: string | null;
    logoUrl: string | null;
    logoDataUrl?: string | null;
    userName: string;
    generatedAtIso: string;
    filters: FinishedGoodsExportFilters;
  }
) {
  const columns = toFinishedGoodsExportColumns(options.filters);
  const exportRows = toFinishedGoodsExportRows(rows);
  return buildPdfBuffer({
    title: "Finished Goods Export",
    generatedAtIso: options.generatedAtIso,
    branding: {
      companyName: options.companyName,
      tradingName: options.tradingName,
      logoUrl: options.logoUrl,
      logoDataUrl: options.logoDataUrl || null,
    },
    userName: options.userName,
    filters: toFinishedGoodsFiltersList(options.filters),
    columns,
    rows: exportRows,
  });
}

const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FF4338CA" },
};

const HEADER_FONT = {
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const CURRENCY_FMT = '"R" #,##0.00;[Red]-"R" #,##0.00';

function autoSizeColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    if (typeof column.eachCell !== "function") return;
    let max = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const raw = cell.value;
      let text = "";
      if (raw == null) {
        text = "";
      } else if (raw instanceof Date) {
        text = formatIsoDate(raw.toISOString());
      } else if (raw && typeof raw === "object" && "text" in raw) {
        text = String((raw as { text?: string }).text || "");
      } else {
        text = String(raw);
      }
      max = Math.max(max, text.length + 2);
    });
    column.width = Math.min(64, max);
  });
}

export async function toFinishedGoodsXlsx(rows: FinishedGoodsExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Finished Goods", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "Finished Good Code", key: "finishedGoodCode" },
    { header: "Finished Good Name", key: "finishedGoodName" },
    { header: "Category", key: "category" },
    { header: "Unit of Measure", key: "unitOfMeasure" },
    { header: "Standard Cost", key: "standardCost", style: { numFmt: CURRENCY_FMT } },
    { header: "Current Cost", key: "currentCost", style: { numFmt: CURRENCY_FMT } },
    { header: "Selling Price", key: "sellingPrice", style: { numFmt: CURRENCY_FMT } },
    { header: "Gross Profit", key: "grossProfit", style: { numFmt: CURRENCY_FMT } },
    { header: "Gross Profit %", key: "grossProfitPercent", style: { numFmt: "0.00%" } },
    { header: "Recipe/BOM Version", key: "recipeBomVersion" },
    { header: "Status", key: "status" },
    { header: "Created Date", key: "createdDate", style: { numFmt: "yyyy-mm-dd" } },
    { header: "Last Updated", key: "lastUpdated", style: { numFmt: "yyyy-mm-dd" } },
    { header: "Stock On Hand", key: "stockOnHand", style: { numFmt: "#,##0.0000" } },
    { header: "Inventory Value", key: "inventoryValue", style: { numFmt: CURRENCY_FMT } },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  for (const row of rows) {
    worksheet.addRow({
      finishedGoodCode: row.finishedGoodCode,
      finishedGoodName: row.finishedGoodName,
      category: row.category,
      unitOfMeasure: row.unitOfMeasure,
      standardCost: row.standardCost,
      currentCost: row.currentCost,
      sellingPrice: row.sellingPrice,
      grossProfit: row.grossProfit,
      grossProfitPercent: row.grossProfitPercent / 100,
      recipeBomVersion: row.recipeBomVersion,
      status: row.status,
      createdDate: row.createdDate,
      lastUpdated: row.lastUpdated,
      stockOnHand: row.stockOnHand,
      inventoryValue: row.inventoryValue,
    });
  }

  autoSizeColumns(worksheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildFinishedGoodsExportFileName(extension: "csv" | "xlsx", now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `FinishedGoods_${year}-${month}-${day}_${hour}-${minute}.${extension}`;
}
