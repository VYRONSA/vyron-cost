import ExcelJS from "exceljs";
import { OrderSourceParseError } from "@/lib/order-engine/adapters/types";

/**
 * Excel (.xlsx) orders → the CSV text the CSV adapter already reads, so an
 * Excel order and a CSV order go through exactly the same column mapping.
 *
 * Parsed with exceljs, not the bundled `xlsx` package (known issues with
 * untrusted input). Limits: 5 MB, first worksheet, 2 000 rows, 60 columns.
 * Cell values are rendered exactly: numbers as written, dates as YYYY-MM-DD,
 * formulas as their stored result, rich text as its plain text. Nothing is
 * coerced or guessed.
 */

export const XLSX_MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const MAX_COLUMNS = 60;

export function isXlsxAttachment(file: { fileName?: string | null; contentType?: string | null }): boolean {
  const type = String(file.contentType || "").toLowerCase();
  const name = String(file.fileName || "").toLowerCase();
  return type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || name.endsWith(".xlsx");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((r) => r.text || "").join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text ?? "");
    if ("error" in v) return "";
  }
  return String(value);
}

function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The first worksheet of an .xlsx file as CSV text. */
export async function xlsxToCsvText(bytes: Buffer | Uint8Array): Promise<string> {
  if (!bytes || bytes.byteLength === 0) throw new OrderSourceParseError("The Excel file is empty.");
  if (bytes.byteLength > XLSX_MAX_BYTES) throw new OrderSourceParseError("The Excel file is larger than 5 MB.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new OrderSourceParseError("The Excel file could not be read.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new OrderSourceParseError("The Excel file has no worksheet.");
  if (sheet.rowCount > MAX_ROWS + 1) throw new OrderSourceParseError(`The worksheet has more than ${MAX_ROWS} rows.`);
  const width = Math.min(sheet.columnCount, MAX_COLUMNS);
  const rows: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(csvField(cellText(row.getCell(c).value).trim()));
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length) rows.push(cells.join(","));
  });
  if (rows.length < 2) throw new OrderSourceParseError("The worksheet has no order lines under its header row.");
  return rows.join("\n");
}
