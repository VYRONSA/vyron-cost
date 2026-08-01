/**
 * VYRON COST — standards-compliant delimited-text parser.
 *
 * THE SINGLE CSV PARSING IMPLEMENTATION IN THE APPLICATION.
 * `vyron-import-centre.ts#parseCsvText` delegates here, so every import route
 * — Import Centre v1, Admin Import, Finance Imports — shares this behaviour.
 * Do not add a second parser.
 *
 * WHY THIS EXISTS
 * ---------------
 * The previous implementation was `line.split(",")` after `.split(/\r?\n/)`.
 * That is not a CSV parser: a supplier named `Acme Foods, Ltd` shifted every
 * subsequent column, an Excel-exported UTF-8 BOM corrupted the first header
 * name, and quoted newlines split one record into several. Supplier master data
 * routinely contains all three.
 *
 * RFC 4180 behaviour implemented here:
 *   - quoted fields, including embedded commas, newlines and delimiters
 *   - escaped quotes inside quoted fields (`""` -> `"`)
 *   - UTF-8 BOM stripped before the header is read
 *   - CRLF, LF and CR line endings
 *   - empty columns preserved as empty strings, never dropped
 *   - trailing newline tolerated
 *
 * Deliberate extensions beyond RFC 4180:
 *   - delimiter auto-detection across , ; \t | (Excel writes ; in many locales)
 *   - blank rows are REPORTED rather than silently discarded
 *   - formula injection neutralised (see `neutraliseFormulaInjection`)
 */

/** Characters Excel and LibreOffice treat as the start of a formula. */
const FORMULA_PREFIXES = ["=", "+", "@"];
/** Control characters that can smuggle a formula past a naive prefix check. */
const CONTROL_PREFIXES = ["\t", "\r"];

const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"] as const;

export type CsvCell = string;
export type CsvRecord = CsvCell[];

export type CsvParseOptions = {
  /** Override delimiter detection. */
  delimiter?: string;
  /** Neutralise spreadsheet formula injection. Default true. */
  neutraliseFormulas?: boolean;
  /** Trim surrounding whitespace on unquoted cells. Default true. */
  trimUnquoted?: boolean;
};

/**
 * Neutralise a value that a spreadsheet would evaluate as a formula.
 *
 * Prefixing with an apostrophe is the standard mitigation, but applying it
 * blindly corrupts legitimate data: `-12.5` is a negative number, not a
 * formula. A value beginning `-` or `+` is therefore only neutralised when it
 * is NOT a valid number. `=`, `@`, tab and CR are never legitimate leading
 * characters in this application's import columns and are always neutralised.
 */
export function neutraliseFormulaInjection(value: string): string {
  if (!value) return value;
  const first = value[0];

  if (CONTROL_PREFIXES.includes(first)) return `'${value}`;
  if (FORMULA_PREFIXES.includes(first)) return `'${value}`;
  if (first === "-") {
    // A well-formed negative number is data, not a formula.
    return Number.isNaN(Number(value)) ? `'${value}` : value;
  }
  return value;
}

/** Detect the delimiter by counting occurrences outside quoted regions. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64_000);
  let best = ",";
  let bestCount = -1;

  for (const candidate of CANDIDATE_DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i += 1) {
      const char = sample[i];
      if (char === '"') {
        if (inQuotes && sample[i + 1] === '"') {
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && char === candidate) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }

  return bestCount > 0 ? best : ",";
}

/** Remove a UTF-8 byte-order mark if present. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse delimited text into records. Never throws on malformed input — an
 * unterminated quote is closed at end of input rather than discarding the file.
 */
export function parseDelimitedText(input: string, options: CsvParseOptions = {}): CsvRecord[] {
  const text = stripBom(input ?? "");
  if (!text) return [];

  const delimiter = options.delimiter || detectDelimiter(text);
  const trimUnquoted = options.trimUnquoted !== false;
  const neutralise = options.neutraliseFormulas !== false;

  const records: CsvRecord[] = [];
  let record: CsvRecord = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  const pushField = () => {
    let value = fieldWasQuoted || !trimUnquoted ? field : field.trim();
    if (neutralise) value = neutraliseFormulaInjection(value);
    record.push(value);
    field = "";
    fieldWasQuoted = false;
  };

  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      fieldWasQuoted = true;
      continue;
    }

    if (char === delimiter) {
      pushField();
      continue;
    }

    if (char === "\r") {
      // CRLF or bare CR both terminate the record.
      if (text[i + 1] === "\n") i += 1;
      pushRecord();
      continue;
    }

    if (char === "\n") {
      pushRecord();
      continue;
    }

    field += char;
  }

  // Flush the final field/record unless the file ended on a clean newline.
  if (field.length > 0 || fieldWasQuoted || record.length > 0) {
    pushRecord();
  }

  return records;
}

export type DelimitedTable = {
  header: string[];
  /** Data records, excluding the header. Blank records are reported, not dropped. */
  rows: { record: CsvRecord; lineNumber: number; isBlank: boolean }[];
  delimiter: string;
};

/** Parse into a header plus numbered data rows. Line numbers are 1-based and include the header. */
export function parseDelimitedTable(input: string, options: CsvParseOptions = {}): DelimitedTable {
  const delimiter = options.delimiter || detectDelimiter(stripBom(input ?? ""));
  const records = parseDelimitedText(input, { ...options, delimiter });

  if (!records.length) return { header: [], rows: [], delimiter };

  // Header names are never formula-neutralised — an apostrophe would break matching.
  const header = records[0].map((cell) => cell.replace(/^'/, "").trim());
  const rows = records.slice(1).map((record, index) => ({
    record,
    lineNumber: index + 2,
    isBlank: record.every((cell) => cell.trim() === ""),
  }));

  return { header, rows, delimiter };
}

/** Case-insensitive, whitespace-tolerant header lookup. */
export function buildHeaderIndex(header: string[]): Map<string, number> {
  const index = new Map<string, number>();
  header.forEach((name, position) => {
    const key = name.trim().toLowerCase();
    if (key && !index.has(key)) index.set(key, position);
  });
  return index;
}
