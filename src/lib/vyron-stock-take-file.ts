import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { decodeCsvBytes, parseCsv, type CsvRecord, type CsvTable } from "@/lib/data-migration/csv";
import { cellText } from "@/lib/order-engine/adapters/xlsx";
import { STOCK_TAKE_COLUMNS, STOCK_TAKE_TEMPLATE_MAX_ITEMS, StockTakeError } from "@/lib/vyron-stock-take-import";
import { STOCK_TAKE_TEMPLATE_COLUMNS } from "@/lib/vyron-stock-take-rules";
import { parseAmount, pickColumn, UPLOAD_MAX_BYTES } from "@/lib/vyron-upload-table";

/**
 * VOLORA — read an uploaded stock take file (Excel or CSV) into the table the stock take preview
 * validates. Read-only; nothing here touches the database.
 *
 * - The format is decided by the file's content, not its name: "15 October 2.csv.xlsx" is a
 *   workbook. Legacy .xls (OLE2) is refused with a clear message — the app has no safe reader for it.
 * - Excel: the stock count sheet is the first worksheet that is not an "Instructions" sheet and has
 *   data. Other sheets are never read as counts. Row numbers are the real Excel row numbers.
 * - Layout: a first row naming the item code and counted quantity columns is a header (any
 *   capitalisation or spacing, any column order). Otherwise the file is read positionally in the
 *   template order — Item Code, Description, Unit, Location, Counted Quantity — and the first row
 *   is stock data, never discarded.
 * - Excel cells cannot shift, so notes beyond the recognised columns are ignored. In a CSV a row
 *   with extra non-blank cells may have spilled (an unquoted "1,5"); it is reported, never guessed.
 */

export type StockTakeFileInfo = {
  format: "xlsx" | "csv";
  sheetName: string | null;
  ignoredSheets: string[];
  layout: "header" | "headerless";
};

export type StockTakeFileTable = CsvTable & { sha256: string; file: StockTakeFileInfo };

const POSITIONAL_HEADER = STOCK_TAKE_TEMPLATE_COLUMNS.map((c) => c.header) as string[];
const MAX_COLUMNS = 60;

type Grid = { row: number; cells: string[] }[];

const isZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;
const isPdf = (b: Uint8Array) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const blank = (cells: string[]) => cells.every((c) => c.trim() === "");

async function excelGrid(bytes: Uint8Array): Promise<{ grid: Grid; sheetName: string; ignoredSheets: string[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new StockTakeError("The Excel file could not be read — it may be damaged. Open it in Excel, save it again as .xlsx and upload it.");
  }
  const sheets = workbook.worksheets;
  const hasData = (s: ExcelJS.Worksheet) => {
    let found = false;
    s.eachRow({ includeEmpty: false }, (row) => {
      if (!found && Array.isArray(row.values) && row.values.some((v) => cellText(v as ExcelJS.CellValue).trim() !== "")) found = true;
    });
    return found;
  };
  const sheet = sheets.find((s) => !/^\s*instructions?\s*$/i.test(s.name) && hasData(s));
  if (!sheet) throw new StockTakeError("The workbook has no stock count sheet with data (an 'Instructions' sheet is never read as a count).");
  if (sheet.rowCount > STOCK_TAKE_TEMPLATE_MAX_ITEMS + 1) throw new StockTakeError(`The sheet "${sheet.name}" has more than ${STOCK_TAKE_TEMPLATE_MAX_ITEMS} rows.`);
  const width = Math.min(sheet.columnCount, MAX_COLUMNS);
  const grid: Grid = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value).trim());
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length) grid.push({ row: rowNumber, cells });
  });
  return { grid, sheetName: sheet.name, ignoredSheets: sheets.filter((s) => s !== sheet).map((s) => s.name) };
}

function csvGrid(bytes: Uint8Array): { grid: Grid; encoding: CsvTable["encoding"]; hadByteOrderMark: boolean } {
  const decoded = decodeCsvBytes(bytes);
  const grid: Grid = [];
  parseCsv(decoded.text).forEach((cells, index) => {
    if (!blank(cells)) grid.push({ row: index + 1, cells: cells.map((c) => c.trim()) });
  });
  if (grid.length > STOCK_TAKE_TEMPLATE_MAX_ITEMS + 1) throw new StockTakeError(`The file has more than ${STOCK_TAKE_TEMPLATE_MAX_ITEMS} rows.`);
  return { grid, encoding: decoded.encoding, hadByteOrderMark: decoded.hadByteOrderMark };
}

/** Header layout if the first row names an item code column and a counted quantity column. */
function isHeaderRow(cells: string[]) {
  return Boolean(pickColumn(cells, STOCK_TAKE_COLUMNS.sku) && pickColumn(cells, STOCK_TAKE_COLUMNS.counted));
}

export async function readStockTakeFile(bytes: Uint8Array, fileName: string, contentType?: string | null): Promise<StockTakeFileTable> {
  if (!bytes || bytes.byteLength === 0) throw new StockTakeError("The file is empty.");
  if (bytes.byteLength > UPLOAD_MAX_BYTES) throw new StockTakeError("The file is larger than 5 MB.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const name = String(fileName || "").toLowerCase();
  const type = String(contentType || "").toLowerCase();

  let grid: Grid;
  let format: StockTakeFileInfo["format"];
  let sheetName: string | null = null;
  let ignoredSheets: string[] = [];
  let encoding: CsvTable["encoding"] = "utf-8";
  let hadByteOrderMark = false;
  if (isZip(bytes)) {
    format = "xlsx";
    ({ grid, sheetName, ignoredSheets } = await excelGrid(bytes));
  } else if (isOle(bytes)) {
    throw new StockTakeError("This is an older Excel (.xls) workbook, which VOLORA cannot read safely. Open it in Excel, choose Save As → Excel Workbook (.xlsx) or CSV, and upload that file.");
  } else if (/\.(xlsx|xlsm|xls)$/.test(name)) {
    throw new StockTakeError("The Excel file could not be read — it is not a valid workbook (it may be damaged or renamed). Open it in Excel, save it again as .xlsx and upload it.");
  } else if (!isPdf(bytes) && (/\.(csv|txt)$/.test(name) || /csv|text\/plain/.test(type))) {
    format = "csv";
    ({ grid, encoding, hadByteOrderMark } = csvGrid(bytes));
  } else {
    throw new StockTakeError("Upload the stock take as an Excel workbook (.xlsx) or a CSV file (.csv).");
  }
  if (!grid.length) throw new StockTakeError("The file has no rows.");

  const headerLayout = isHeaderRow(grid[0].cells);
  const header = headerLayout ? grid[0].cells : POSITIONAL_HEADER;
  const body = headerLayout ? grid.slice(1) : grid;
  if (!headerLayout) {
    // Positional read: the first row must itself look like stock data (its quantity column blank or
    // a number); otherwise it is an unrecognised header and the columns cannot be trusted.
    const firstQty = grid[0].cells[4] ?? "";
    if (firstQty !== "" && parseAmount(firstQty) === null)
      throw new StockTakeError(
        `The first row is not the stock take header and not a stock row. Use the columns ${POSITIONAL_HEADER.join(", ")} — either with that header row or without a header in that order.`
      );
  }
  if (!body.length) throw new StockTakeError("The file has a header row but no stock rows under it.");

  const records: CsvRecord[] = [];
  const malformedRows: number[] = [];
  for (const { row, cells } of body) {
    if (format === "csv" && cells.slice(header.length).some((c) => c !== "")) malformedRows.push(row);
    records.push({ row, values: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])) });
  }
  return {
    header,
    records,
    encoding,
    hadByteOrderMark,
    malformedRows,
    sha256,
    file: { format, sheetName, ignoredSheets, layout: headerLayout ? "header" : "headerless" },
  };
}
