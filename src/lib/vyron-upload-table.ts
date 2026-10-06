import { createHash } from "node:crypto";
import { readCsvTable, type CsvTable } from "@/lib/data-migration/csv";
import { isXlsxAttachment, xlsxToCsvText } from "@/lib/order-engine/adapters/xlsx";

/**
 * An uploaded spreadsheet (CSV or Excel) as records keyed by header — through the two parsers the
 * application already trusts: the RFC 4180 CSV reader (cells kept exactly as written) and the
 * size-limited exceljs reader (first worksheet). Nothing is guessed: rows whose cell count
 * differs from the header are reported in `malformedRows`.
 */
export class UploadTableError extends Error {}

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export async function readUploadedTable(bytes: Uint8Array, fileName: string, contentType?: string | null): Promise<CsvTable & { sha256: string }> {
  if (!bytes || bytes.byteLength === 0) throw new UploadTableError("The file is empty.");
  if (bytes.byteLength > UPLOAD_MAX_BYTES) throw new UploadTableError("The file is larger than 5 MB.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const name = String(fileName || "").toLowerCase();
  let table: CsvTable;
  if (isXlsxAttachment({ fileName, contentType })) {
    let text: string;
    try {
      text = await xlsxToCsvText(bytes);
    } catch (error) {
      throw new UploadTableError(error instanceof Error ? error.message : "The Excel file could not be read.");
    }
    table = readCsvTable(new TextEncoder().encode(text));
  } else if (name.endsWith(".csv") || name.endsWith(".txt") || /csv|text\/plain/.test(String(contentType || ""))) {
    table = readCsvTable(bytes);
  } else {
    throw new UploadTableError("Upload a CSV or Excel (.xlsx) file.");
  }
  if (!table.header.length || !table.records.length) throw new UploadTableError("The file has no rows under its header.");
  return { ...table, sha256 };
}

/** The value of the first header that matches one of the names (case, spaces and punctuation ignored). */
export function pickColumn(header: string[], names: string[]): string | null {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = names.map(key);
  for (const want of wanted) {
    const found = header.find((h) => key(h) === want);
    if (found) return found;
  }
  return null;
}

/** A money / quantity cell: "R 1 234,50", "1,234.50", "(500.00)", "-500" → number; blank → null. */
export function parseAmount(raw: string | null | undefined): number | null {
  let text = String(raw ?? "").trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[Rr$€£\s ]/g, "");
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (/^-/.test(text)) {
    negative = !negative;
    text = text.slice(1);
  }
  // Decimal comma ("1234,50" or "1.234,50") vs thousands comma ("1,234.50").
  if (/,\d{1,2}$/.test(text) && !/\.\d{1,2}$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  else text = text.replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

/** A date cell as YYYY-MM-DD: ISO, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, or yyyy/mm/dd. Ambiguous or invalid → null. */
export function parseDateCell(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]; // South African day-first
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}
