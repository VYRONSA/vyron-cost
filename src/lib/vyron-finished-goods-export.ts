import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { listStockBackedFinishedGoodsForInvoice } from "@/lib/vyron-inventory";

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
    search: String(searchParams.get("search") || "").trim().toLowerCase(),
    category: String(searchParams.get("category") || "").trim().toLowerCase(),
    status,
    sortBy,
    sortDirection,
  };
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
  const stockBackedRows = await listStockBackedFinishedGoodsForInvoice(supabase, companyId);
  if (!stockBackedRows.length) return [];

  const rows = stockBackedRows.map((row) => {
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
