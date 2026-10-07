/**
 * VOLORA — stock take rules shared by the server and the upload screen (no server imports).
 *
 * The Stock Take Date: the day the physical count was performed (not the upload day).
 *
 * A count is taken as at close of business on that day, South African time (UTC+02:00, no daylight
 * saving). Every movement dated before midnight at the end of that day is part of the system stock
 * the count is compared with; every movement from that moment on happened after the count. The
 * variance movements a posted count writes are dated one millisecond before that boundary — on the
 * Stock Take Date — never on the upload or posting day.
 */

const SA_OFFSET = "+02:00";

/** Today's date in South Africa as YYYY-MM-DD. */
export function todayInSouthAfrica(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Why a Stock Take Date is not acceptable, or null when it is: required, a real YYYY-MM-DD calendar
 * date, and not after today (a count cannot have been performed in the future).
 */
export function stockTakeDateProblem(value: string | null | undefined, today: string = todayInSouthAfrica()): string | null {
  const text = String(value ?? "").trim();
  if (!text) return "Enter the Stock Take Date — the day the physical count was performed.";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return `Stock Take Date "${text}" is not a date (use YYYY-MM-DD).`;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return `Stock Take Date "${text}" is not a real calendar date.`;
  if (text > today) return `Stock Take Date ${text} is in the future; a count can only be recorded for today or an earlier day.`;
  return null;
}

/** The first instant after the Stock Take Date (midnight at its end, SA time), as a UTC ISO timestamp. */
export function stockTakeCutoff(stockTakeDate: string): string {
  const start = new Date(`${stockTakeDate}T00:00:00.000${SA_OFFSET}`);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/** When a posted count's variance movements take effect: the last instant of the Stock Take Date (SA time), UTC ISO. */
export function stockTakeEffectiveAt(stockTakeDate: string): string {
  return new Date(new Date(stockTakeCutoff(stockTakeDate)).getTime() - 1).toISOString();
}

/** The template's columns, in order. Item Code and Counted Quantity are required; the rest are for reference. */
export const STOCK_TAKE_TEMPLATE_COLUMNS = [
  { header: "Item Code", required: true, help: "VOLORA stock item code (or barcode / SKU / alias). Do not change it." },
  { header: "Description", required: false, help: "For reference only — matching is on the item code." },
  { header: "Unit", required: false, help: "Unit the quantity is counted in (for reference)." },
  { header: "Location", required: false, help: "Optional — where the stock was counted." },
  { header: "Counted Quantity", required: true, help: "Physical quantity counted, in the item's unit. 0 if none on hand; leave blank if not counted." },
] as const;

export const STOCK_TAKE_TEMPLATE_EXAMPLE = { "Item Code": "CHK-BR", Description: "Chicken Breast", Unit: "kg", Location: "Main Store", "Counted Quantity": "115.5" } as const;
