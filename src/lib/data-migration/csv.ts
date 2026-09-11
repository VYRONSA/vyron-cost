/**
 * RFC 4180 CSV reading for migration sources.
 *
 * Written here rather than delegated to a spreadsheet library because
 * spreadsheet libraries "helpfully" retype cells — a 12-digit SKU becomes
 * 7.45853E+11, and a leading byte-order mark can swallow the first header's
 * opening quote. Identity cannot survive either. Every value here stays the
 * exact text of the file.
 *
 * Standalone (no path aliases) so verification scripts can import it directly.
 */

export type CsvDecode = { text: string; encoding: "utf-8" | "windows-1252"; hadByteOrderMark: boolean };

/**
 * Bytes to text. Strict UTF-8 first; a file that is not valid UTF-8 is decoded
 * as Windows-1252 — the encoding legacy Windows exports use — and the caller is
 * told, so the substitution is reported rather than silent.
 */
export function decodeCsvBytes(bytes: Uint8Array): CsvDecode {
  let hadByteOrderMark = false;
  let body = bytes;
  if (body.length >= 3 && body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) {
    hadByteOrderMark = true;
    body = body.subarray(3);
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8", hadByteOrderMark };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), encoding: "windows-1252", hadByteOrderMark };
  }
}

/** Parse CSV text into rows of exact cell text. Quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < source.length) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += ch === "\r" && source[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type CsvRecord = { row: number; values: Record<string, string> };

export type CsvTable = {
  header: string[];
  records: CsvRecord[];
  encoding: CsvDecode["encoding"];
  hadByteOrderMark: boolean;
  /** Rows whose cell count differs from the header — reported, never guessed at. */
  malformedRows: number[];
};

/**
 * A CSV file as records keyed by header. `row` is the 1-based line number of
 * the record in the file (header = row 1), so every record can be traced back.
 * Wholly blank lines are skipped but still counted in the numbering.
 */
export function readCsvTable(bytes: Uint8Array): CsvTable {
  const decoded = decodeCsvBytes(bytes);
  const rows = parseCsv(decoded.text);
  const header = (rows[0] || []).map((cell) => cell.trim());
  const records: CsvRecord[] = [];
  const malformedRows: number[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (cells.every((cell) => cell.trim() === "")) continue;
    if (cells.length !== header.length) malformedRows.push(index + 1);
    records.push({ row: index + 1, values: Object.fromEntries(header.map((key, column) => [key, cells[column] ?? ""])) });
  }
  return { header, records, encoding: decoded.encoding, hadByteOrderMark: decoded.hadByteOrderMark, malformedRows };
}
