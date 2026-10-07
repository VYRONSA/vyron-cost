/**
 * Synthetic supplier statement PDFs for tests — invented suppliers, deliberately different layouts.
 * Drawn with jsPDF (a project dependency), so every PDF has a real text layer like a supplier's
 * own digital statement. No real supplier, customer or document is represented.
 */
import { jsPDF } from "jspdf";

const OWN = "Handcrafted Food Products (Pty) Ltd";

function doc() {
  return new jsPDF({ unit: "pt", format: "a4" });
}
const bytes = (d) => new Uint8Array(d.output("arraybuffer"));

/** Draw a row of cells: [text, x, align?]. */
function row(d, y, cells, size = 9) {
  d.setFontSize(size);
  for (const [text, x, align] of cells) if (text !== "" && text !== null && text !== undefined) d.text(String(text), x, y, align ? { align } : undefined);
}

/**
 * A — "classic accounting package": Date | Reference | Description | Debit | Credit | Balance,
 * dd/mm/yyyy, space thousands + decimal comma, two pages with a repeated heading, carried / brought
 * forward at the page break, a wrapped description, an ageing table with the total due.
 */
export function layoutClassic() {
  const d = doc();
  row(d, 50, [["Coastal Fresh Produce (Pty) Ltd", 40]], 14);
  row(d, 66, [["12 Harbour Road, Gqeberha", 40], ["VAT No 4123456789", 400]]);
  row(d, 90, [["STATEMENT", 40]], 12);
  row(d, 110, [["To: " + OWN, 40], ["Account No: HFP001", 400]]);
  row(d, 124, [["Unit 4, Kloof Street, Cape Town", 40], ["Statement Date: 31/10/2026", 400]]);
  const head = (y) => row(d, y, [["Date", 40], ["Reference", 110], ["Description", 190], ["Debit", 400, "right"], ["Credit", 470, "right"], ["Balance", 550, "right"]]);
  head(160);
  const lines = [
    ["01/10/2026", "", "Balance brought forward", "", "", "1 000,00"],
    ["03/10/2026", "IN10231", "Tax Invoice", "2 300,00", "", "3 300,00"],
    ["05/10/2026", "IN10244", "Tax Invoice", "1 150,50", "", "4 450,50"],
    ["12/10/2026", "PMT8812", "Payment received - thank you", "", "1 000,00", "3 450,50"],
    ["15/10/2026", "CN2201", "Credit note - damaged stock", "", "150,50", "3 300,00"],
  ];
  let y = 176;
  for (const l of lines) {
    row(d, y, [[l[0], 40], [l[1], 110], [l[2], 190], [l[3], 400, "right"], [l[4], 470, "right"], [l[5], 550, "right"]]);
    y += 16;
  }
  row(d, y + 8, [["Balance carried forward", 190], ["3 300,00", 550, "right"]]);
  row(d, 800, [["Page 1 of 2", 280]]);
  d.addPage();
  row(d, 50, [["Coastal Fresh Produce (Pty) Ltd", 40]], 10);
  head(80);
  row(d, 96, [["", 40], ["", 110], ["Balance brought forward", 190], ["", 400], ["", 470], ["3 300,00", 550, "right"]]);
  row(d, 112, [["20/10/2026", 40], ["IN10301", 110], ["Tax Invoice", 190], ["4 000,00", 400, "right"], ["7 300,00", 550, "right"]]);
  row(d, 128, [["28/10/2026", 40], ["IN10322", 110], ["Tax Invoice - mixed vegetables", 190], ["700,00", 400, "right"], ["8 000,00", 550, "right"]]);
  row(d, 139, [["delivered to Cape Town depot", 190]]);
  row(d, 180, [["Current", 120, "right"], ["30 Days", 220, "right"], ["60 Days", 320, "right"], ["90 Days", 420, "right"], ["Total Due", 550, "right"]]);
  row(d, 196, [["4 700,00", 120, "right"], ["3 300,00", 220, "right"], ["0,00", 320, "right"], ["0,00", 420, "right"], ["8 000,00", 550, "right"]]);
  row(d, 800, [["Page 2 of 2", 280]]);
  return bytes(d);
}

/**
 * B — "ERP export": Doc No. | Type | Doc Date | Due Date | Amount (one signed amount column),
 * ISO dates, comma thousands + decimal point, a credit as a minus and a payment with a CR suffix,
 * stated period, opening and closing balance labels.
 */
export function layoutErp() {
  const d = doc();
  row(d, 50, [["METRO PACKAGING LIMITED", 40]], 14);
  row(d, 66, [["Reg No 2009/123456/06", 40]]);
  row(d, 96, [["Customer: " + OWN, 40]]);
  row(d, 112, [["Statement period: 2026-10-01 to 2026-10-31", 40]]);
  row(d, 136, [["Opening Balance", 40], ["2,000.00", 550, "right"]]);
  row(d, 160, [["Doc No.", 40], ["Type", 130], ["Doc Date", 200], ["Due Date", 300], ["Amount", 550, "right"]]);
  const lines = [
    ["INV-5501", "INV", "2026-10-02", "2026-11-01", "1,250.00"],
    ["INV-5502", "INV", "2026-10-09", "2026-11-08", "3,400.75"],
    ["CRN-0091", "CRN", "2026-10-11", "", "-250.00"],
    ["RCP-7781", "PMT", "2026-10-20", "", "1,000.00 CR"],
    ["JNL-12", "JNL", "2026-10-25", "", "15.00"],
  ];
  let y = 176;
  for (const l of lines) {
    row(d, y, [[l[0], 40], [l[1], 130], [l[2], 200], [l[3], 300], [l[4], 550, "right"]]);
    y += 16;
  }
  row(d, y + 12, [["Closing Balance", 40], ["5,415.75", 550, "right"]]);
  return bytes(d);
}

/**
 * C — "small wholesaler": Invoice No | Date | Details | Amount | Balance, named-month dates,
 * a payment in brackets, no type column, supplier given by "Remit to", month period, a line whose
 * running balance does not agree, and an amount line without a date.
 */
export function layoutWholesaler() {
  const d = doc();
  row(d, 40, [["Statement of Account", 40]], 12);
  row(d, 60, [["Remit to: Karoo Meat Wholesalers CC", 40]]);
  row(d, 76, [["Account name: " + OWN, 40]]);
  row(d, 92, [["For the month of October 2026", 40]]);
  row(d, 116, [["Opening balance", 40], ["500.00", 540, "right"]]);
  row(d, 140, [["Invoice No", 40], ["Date", 110], ["Details", 210], ["Amount", 440, "right"], ["Balance", 540, "right"]]);
  const lines = [
    ["45821", "05 Oct 2026", "Lamb shoulder", "2 450.00", "2 950.00"],
    ["45830", "12 Oct 2026", "Beef mince", "1 800.00", "4 750.00"],
    ["PAY-301", "18 Oct 2026", "Payment", "(2 950.00)", "1 800.00"],
    ["45844", "22 Oct 2026", "Pork belly", "990.00", "2 999.00"],
  ];
  let y = 156;
  for (const l of lines) {
    row(d, y, [[l[0], 40], [l[1], 110], [l[2], 210], [l[3], 440, "right"], [l[4], 540, "right"]]);
    y += 16;
  }
  row(d, y + 30, [["Delivery surcharge", 210], ["45.00", 440, "right"]]);
  row(d, y + 60, [["Total due", 40], ["2 999.00", 540, "right"]]);
  return bytes(d);
}

/**
 * D — "no column headings": each line is date, document number, text, amount, running balance;
 * dd.mm.yy dates, decimal comma, a payment with a trailing minus, balance due at the end.
 */
export function layoutHeaderless() {
  const d = doc();
  row(d, 50, [["Highveld Dairy (Pty) Ltd", 40]], 13);
  row(d, 70, [["Statement as at 31.10.26", 40]]);
  row(d, 86, [["Deliver to: " + OWN, 40]]);
  const lines = [
    ["02.10.26", "INV88231", "Milk 2L x 40", "1 250,50", "1 250,50"],
    ["09.10.26", "INV88290", "Cream 1L x 20", "640,00", "1 890,50"],
    ["16.10.26", "RC-1102", "Payment received", "1 250,50-", "640,00"],
  ];
  let y = 120;
  for (const l of lines) {
    row(d, y, [[l[0], 40], [l[1], 100], [l[2], 180], [l[3], 440, "right"], [l[4], 540, "right"]]);
    y += 16;
  }
  row(d, y + 20, [["Balance due", 40], ["640,00", 540, "right"]]);
  return bytes(d);
}

/**
 * E — "month-first": Date | Invoice # | Description | Charges | Payments | Balance, mm/dd/yyyy,
 * "Balance forward", and a credit line that says nothing about what it is.
 */
export function layoutMonthFirst() {
  const d = doc();
  row(d, 50, [["Prairie Spice Co. Inc.", 40]], 13);
  row(d, 70, [["Bill to: " + OWN, 40], ["Statement Date: 10/31/2026", 380]]);
  row(d, 100, [["Date", 40], ["Invoice #", 110], ["Description", 190], ["Charges", 380, "right"], ["Payments", 460, "right"], ["Balance", 550, "right"]]);
  const lines = [
    ["", "", "Balance forward", "", "", "0.00"],
    ["10/05/2026", "S-1001", "Spices", "300.00", "", "300.00"],
    ["10/15/2026", "S-1002", "Spices", "120.00", "", "420.00"],
    ["10/20/2026", "", "Payment - thank you", "", "300.00", "120.00"],
    ["10/22/2026", "X-55", "Misc", "", "50.00", "70.00"],
  ];
  let y = 116;
  for (const l of lines) {
    row(d, y, [[l[0], 40], [l[1], 110], [l[2], 190], [l[3], 380, "right"], [l[4], 460, "right"], [l[5], 550, "right"]]);
    y += 16;
  }
  row(d, y + 16, [["Amount Due", 40], ["70.00", 550, "right"]]);
  return bytes(d);
}

/** F — a "scan": a page with shapes and no text layer at all. */
export function layoutScanned() {
  const d = doc();
  d.setFillColor(230, 230, 230);
  d.rect(40, 40, 500, 700, "F");
  d.setDrawColor(0, 0, 0);
  for (let y = 80; y < 700; y += 20) d.line(60, y, 520, y);
  return bytes(d);
}

/** G — two different company names in the letterhead and no supplier label. */
export function layoutTwoCompanies() {
  const d = doc();
  row(d, 50, [["Group Foods Holdings Ltd", 40]], 12);
  row(d, 66, [["Fresh Bakes (Pty) Ltd", 40]], 12);
  row(d, 100, [["Date", 40], ["Reference", 110], ["Description", 190], ["Debit", 400, "right"], ["Credit", 470, "right"], ["Balance", 550, "right"]]);
  row(d, 116, [["03/10/2026", 40], ["IN-1", 110], ["Bread", 190], ["100,00", 400, "right"], ["", 470], ["100,00", 550, "right"]]);
  row(d, 140, [["Closing balance", 40], ["100,00", 550, "right"]]);
  return bytes(d);
}

export const OWN_COMPANY = OWN;
