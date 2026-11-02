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

/**
 * A money / quantity cell → number; blank or unreadable → null.
 *
 *   "R 1 234,50" → 1234.5    "1,234.50" → 1234.5    "1.234,50" → 1234.5
 *   "0,125" → 0.125          "R18,45" → 18.45        "1,5" → 1.5
 *   "(500.00)" / "500-" / "-500" → -500
 *
 * A comma is a DECIMAL comma (the South African convention; thousands are
 * grouped with spaces) unless the cell also has a dot, or several commas in
 * groups of three. One comma followed by exactly three digits and a non-zero
 * whole part ("12,345") is ambiguous — 12.345 or 12345 — and returns null
 * rather than a guess, so the row is reported instead of loading 1000× wrong.
 * "0,125" is never thousands (a thousands group never follows a lone 0).
 */
export function parseAmount(raw: string | null | undefined): number | null {
  let text = String(raw ?? "").trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/^(ZAR|R|\$|€|£)/i, "").replace(/[Rr$€£\s\u00a0\u202f']/g, "");
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (/^-/.test(text)) {
    negative = !negative;
    text = text.slice(1);
  }
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Both separators: the last one is the decimal point ("1.234,50" / "1,234.50").
    text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const commas = (text.match(/,/g) || []).length;
    if (commas > 1) {
      // "1,234,567": thousands groups of exactly three; anything else is not a number.
      if (!/^\d{1,3}(,\d{3})+$/.test(text)) return null;
      text = text.replace(/,/g, "");
    } else {
      const [whole, fraction] = text.split(",");
      if (fraction.length === 3 && whole !== "0" && whole !== "") return null; // "12,345": ambiguous
      text = `${whole}.${fraction}`;
    }
  }
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
